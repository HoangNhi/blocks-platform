using Blocks.Shared.DTOs.Base;
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Blocks.CatalogService.Configs;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Entities;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.CatalogService.Services.CoreFeature.Faculty;
using Blocks.Shared.Common;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Protos;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using MySqlConnector;

internal static class ProviderChecks
{
    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Assertion failed: {message}");
        }
    }

    internal static string ValidateIsolatedConnection(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Connection string must not be empty");
        }

        MySqlConnectionStringBuilder builder;
        try
        {
            builder = new MySqlConnectionStringBuilder(connectionString);
        }
        catch (Exception)
        {
            throw new InvalidOperationException("Connection string format is invalid");
        }

        var host = builder.Server?.Trim();
        var allowedHosts = new[] { "localhost", "127.0.0.1", "::1" };
        if (string.IsNullOrEmpty(host) || !allowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Connection host must be localhost, 127.0.0.1, or ::1");
        }

        if (string.IsNullOrEmpty(builder.Database) || !string.Equals(builder.Database, "blocks_catalogservice_upgrade_test", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Database must be exactly 'blocks_catalogservice_upgrade_test'");
        }

        if (builder.ConnectionProtocol != MySqlConnectionProtocol.Sockets &&
            builder.ConnectionProtocol != MySqlConnectionProtocol.Socket &&
            builder.ConnectionProtocol != MySqlConnectionProtocol.Tcp)
        {
            throw new InvalidOperationException("Protocol must be TCP");
        }

        if (builder.ContainsKey("PipeName") || builder.ContainsKey("Pipe Name"))
        {
            throw new InvalidOperationException("Named pipes are not supported");
        }

        return connectionString;
    }

    internal static void RunGuardChecks()
    {
        connection_guard_rejects_unsafe_target_before_open();
        connection_guard_accepts_only_isolated_tcp_target();
    }

    private static void connection_guard_rejects_unsafe_target_before_open()
    {
        const string secretMarker = "distinctive_secret_password";
        var unsafeInputs = new[]
        {
            null,
            "",
            "   ",
            "malformed;;;;=-=",
            "Server=remote;Database=blocks_catalogservice_upgrade_test",
            "Server=127.0.0.1;Database=catalog",
            "Server=127.0.0.1,remote;Database=blocks_catalogservice_upgrade_test",
            "Server=localhost;ConnectionProtocol=NamedPipe;Database=blocks_catalogservice_upgrade_test",
            "Server=localhost;ConnectionProtocol=UnixSocket;Database=blocks_catalogservice_upgrade_test",
            "Server=127.0.0.1;Port=3306;",
            "Server=127.0.0.1;Database=Blocks_CatalogService_Upgrade_Test",
            "Server=127.0.0.1;Database=blocks_catalogservice_upgrade_test_extra",
            "Server=127.0.0.2;Database=blocks_catalogservice_upgrade_test",
            "Server=localhost.localdomain;Database=blocks_catalogservice_upgrade_test",
            "Server=127.0.0.1.nip.io;Database=blocks_catalogservice_upgrade_test",
            "Server=127.0.0.1;Database=blocks_catalogservice_upgrade_test;Protocol=pipe",
            "Server=127.0.0.1;Database=blocks_catalogservice_upgrade_test;PipeName=mypipe",
            $"Server=127.0.0.1;Database=catalog;Pwd={secretMarker}",
            $"Server=remote;Database=blocks_catalogservice_upgrade_test;Pwd={secretMarker}",
            $"Server=127.0.0.1;Database=blocks_catalogservice_upgrade_test;ConnectionProtocol=NamedPipe;Pwd={secretMarker}"
        };

        foreach (var input in unsafeInputs)
        {
            bool threw = false;
            try
            {
                ValidateIsolatedConnection(input);
            }
            catch (InvalidOperationException ex)
            {
                threw = true;
                Require(!ex.Message.Contains(secretMarker), "Guard error must not leak distinctive test password");
            }

            Require(threw, $"ValidateIsolatedConnection must reject unsafe target before open: {input ?? "<null>"}");
        }
    }

    private static void connection_guard_accepts_only_isolated_tcp_target()
    {
        var safe1 = "Server=127.0.0.1;Port=1;Database=blocks_catalogservice_upgrade_test;Uid=x;Pwd=x;";
        Require(ValidateIsolatedConnection(safe1) == safe1, "Safe input retained without opening DB");

        var safe2 = "Server=localhost;Port=3306;Database=blocks_catalogservice_upgrade_test;Uid=root;Pwd=;";
        Require(ValidateIsolatedConnection(safe2) == safe2, "Safe input retained without opening DB");

        var safe3 = "Server=::1;Port=3306;Database=blocks_catalogservice_upgrade_test;Uid=test;Pwd=test;";
        Require(ValidateIsolatedConnection(safe3) == safe3, "Safe input retained without opening DB");
    }

    internal static async Task RunAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable("CATALOGSERVICE_UPGRADE_TEST_CONNECTION");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("CATALOGSERVICE_UPGRADE_TEST_CONNECTION environment variable is not configured. Live database checks require an isolated test database.");
        }

        ValidateIsolatedConnection(connectionString);

        bool tableCreatedByThisRun = false;

        try
        {
            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT DATABASE();";
                    var currentDb = (string?)await cmd.ExecuteScalarAsync();
                    Require(string.Equals(currentDb, "blocks_catalogservice_upgrade_test", StringComparison.Ordinal),
                        "Target database must be blocks_catalogservice_upgrade_test");

                    cmd.CommandText = "SELECT VERSION(), @@version_comment, @@session.time_zone, @@global.time_zone;";
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        Require(await reader.ReadAsync(), "Server metadata query returned rows");
                        var version = reader.GetString(0);
                        var comment = reader.GetString(1);
                        Require(!string.IsNullOrEmpty(version), "Server version is non-empty");
                        Require(!string.IsNullOrEmpty(comment), "Server comment is non-empty");
                    }

                    cmd.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'faculty';";
                    var tableCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                    Require(tableCount == 0, "Preexisting faculty table rejected before run");

                    cmd.CommandText = "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = 'faculty';";
                    var viewCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                    Require(viewCount == 0, "Preexisting faculty view rejected before run");

                    cmd.CommandText = @"
CREATE TABLE `faculty` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `name` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(255) NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(255) DEFAULT NULL,
  `is_actived` tinyint(1) NOT NULL DEFAULT '1',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;";
                    await cmd.ExecuteNonQueryAsync();
                    tableCreatedByThisRun = true;
                }
            }

            // Lifecycle assertions: probe refusal inside current owned fixture
            bool probeRefused = false;
            try
            {
                using var probeConn = new MySqlConnection(connectionString);
                await probeConn.OpenAsync();
                using var probeCmd = probeConn.CreateCommand();
                probeCmd.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'faculty';";
                var count = Convert.ToInt64(await probeCmd.ExecuteScalarAsync());
                if (count > 0)
                {
                    throw new InvalidOperationException("Probe refused: table already exists");
                }
            }
            catch (InvalidOperationException)
            {
                probeRefused = true;
            }
            Require(probeRefused, "Probe refused when faculty table already exists");

            // WebApplication fixture with capturing audit invoker
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = Array.Empty<string>(),
                EnvironmentName = Environments.Development
            });

            builder.Configuration.Sources.Clear();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Catalog"] = connectionString,
                ["GrpcClients:SystemService"] = "http://127.0.0.1:1"
            });

            builder.ExecuteConfigService();

            var capturingInvoker = new CapturingAuditInvoker();
            builder.Services.Replace(ServiceDescriptor.Singleton(new AuditProto.AuditProtoClient(capturingInvoker)));

            var app = builder.Build();

            // Pinned fixture data
            var row1Id = Guid.Parse("00000000-0000-4000-8000-000000000001");
            var row2Id = Guid.Parse("00000000-0000-4000-8000-000000000002");
            var row3Id = Guid.Parse("00000000-0000-4000-8000-000000000003");
            var row4Id = Guid.NewGuid();

            using (var seedConn = new MySqlConnection(connectionString))
            {
                await seedConn.OpenAsync();
                using var seedCmd = seedConn.CreateCommand();
                seedCmd.CommandText = @"
INSERT INTO `faculty` (`id`, `name`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_actived`, `is_deleted`)
VALUES 
  (@id1, 'Phòng Công nghệ', '2026-10-22 00:00:01', 'SeedActor', NULL, NULL, 1, 0),
  (@id2, 'Phòng Đào tạo', '2026-10-22 00:00:02', 'SeedActor', '2026-10-22 00:00:02', 'SeedActor', 1, 0),
  (@id3, 'Phòng Kế toán', '2026-10-22 00:00:03', 'SeedActor', NULL, NULL, 1, 0),
  (@id4, '100%_O\'Reilly', '2026-10-22 00:00:04', 'SeedActor', NULL, NULL, 1, 0);";
                seedCmd.Parameters.AddWithValue("@id1", row1Id.ToString());
                seedCmd.Parameters.AddWithValue("@id2", row2Id.ToString());
                seedCmd.Parameters.AddWithValue("@id3", row3Id.ToString());
                seedCmd.Parameters.AddWithValue("@id4", row4Id.ToString());
                await seedCmd.ExecuteNonQueryAsync();
            }

            // Test 1: uuid_sql_to_ef_and_service_to_sql
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var loaded = await context.Faculties.FindAsync(row1Id);
                Require(loaded != null && loaded.Id == row1Id, "Raw char(36) UUID read unchanged");
            }

            var callerId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", "caller_user");
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var inserted = await service.Insert(new FacultyRequest { Id = callerId, Name = "Phòng Khảo thí" });
                Require(inserted.Id == callerId, "Caller UUID retained");
                var createAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(createAudit.Action == "CREATE" && createAudit.EntityId == callerId.ToString(), "CREATE audit captured");
            }

            Guid generatedId;
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", "generator_user");
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var generated = await service.Insert(new FacultyRequest { Id = Guid.Empty, Name = "Phòng Thanh tra" });
                Require(generated.Id != Guid.Empty, "Empty request ID generated");
                generatedId = generated.Id;
                var genAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(genAudit.EntityId == generatedId.ToString(), "Generated ID audit captured");
            }

            // Test 2: flags_defaults_null_and_timestamp_roundtrip
            var inactiveId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", "flags_user");
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var inactive = await service.Insert(new FacultyRequest
                {
                    Id = inactiveId,
                    Name = "Phòng Tạm ngưng",
                    IsActived = false
                });
                Require(inactive.IsActived == false, "Explicit false survives DB default true");
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
            }

            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var defaulted = await context.Faculties.FindAsync(row1Id);
                Require(defaulted != null && defaulted.IsActived == true, "Omitted/default active retains baseline");

                // Test entity IsActived = null directly
                var nullActiveFaculty = new Faculty
                {
                    Id = Guid.NewGuid(),
                    Name = "Phòng Chưa gán cờ",
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "DirectContext",
                    IsActived = null,
                    IsDeleted = false
                };
                await context.Faculties.AddAsync(nullActiveFaculty);
                await context.SaveChangesAsync();
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
            }

            // JsonOptions UTC+7 serialization
            var jsonOptions = new JsonSerializerOptions();
            jsonOptions.Converters.Add(new VietnamDateTimeConverter());
            jsonOptions.Converters.Add(new VietnamNullableDateTimeConverter());
            var sampleDto = new ModelFaculty
            {
                Id = Guid.NewGuid(),
                Name = "Time Test",
                CreatedAt = DateTime.SpecifyKind(new DateTime(2026, 10, 22, 0, 0, 0), DateTimeKind.Utc)
            };
            var serialized = JsonSerializer.Serialize(sampleDto, jsonOptions);
            Require(serialized.Contains("\"CreatedAt\":\"2026-10-22T07:00:00\""), "Fixed 2026-10-22T00:00:00Z becomes 2026-10-22T07:00:00");

            // Test 3: unicode_search_paging_and_duplicate_name
            using (var scope = app.Services.CreateScope())
            {
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var page = await service.GetList(new GetListPagingRequest
                {
                    TextSearch = "Phòng",
                    PageIndex = 2,
                    PageSize = 1
                });
                Require(page.TotalRow == 3 && page.Data.Count == 1, "Count independent of page size");
                Require(page.Data[0].Id == row2Id, "Page 2 size 1 returns row 2 by timestamp desc");

                // Literal search '%', '_', '''
                var literalPage = await service.GetList(new GetListPagingRequest
                {
                    TextSearch = "100%_O'Reilly",
                    PageIndex = 1,
                    PageSize = 10
                });
                Require(literalPage.TotalRow == 1 && literalPage.Data[0].Id == row4Id, "Literal special characters matched");

                // Duplicate name rejection
                bool dupThrew = false;
                try
                {
                    await service.Insert(new FacultyRequest { Name = "Phòng Công nghệ" });
                }
                catch (BusinessException ex) when (ex.Message == "Tên phòng ban đã tồn tại")
                {
                    dupThrew = true;
                }
                Require(dupThrew, "Duplicate name rejected by business validation");

                // Update excluding own ID
                SetScopedHttpContext(scope, "UPDATE", "/api/Faculty/update", "updater_user");
                var updatedSelf = await service.Update(new FacultyRequest
                {
                    Id = row1Id,
                    Name = "Phòng Công nghệ",
                    IsActived = true
                });
                Require(updatedSelf.Id == row1Id, "Updating self with same name succeeds");
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));

                // Combobox active-only & order
                var combobox = await service.GetAllForCombobox();
                Require(combobox.All(c => c.Value != inactiveId.ToString()), "Combobox excludes inactive row");
                Require(combobox.Select(c => c.Text).SequenceEqual(combobox.Select(c => c.Text).OrderBy(x => x)),
                    "Combobox ordered alphabetically");
            }

            // Test 4: failed_batch_and_failed_save_never_succeed
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "DELETE", "/api/Faculty/delete-list", "deleter_user");
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                bool deleteThrew = false;
                try
                {
                    await service.DeleteList(new DeleteListRequest
                    {
                        Ids = new List<Guid> { row1Id, Guid.NewGuid() }
                    });
                }
                catch (BusinessException)
                {
                    deleteThrew = true;
                }
                Require(deleteThrew, "Delete with missing second ID threw BusinessException");
            }

            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var reloaded = await context.Faculties.FindAsync(row1Id);
                Require(reloaded != null && !reloaded.IsDeleted, "Missing second ID persisted no first-row delete");
            }

            // Duplicate PK DbUpdateException check - verify no success audit emitted
            capturingInvoker.Drain();
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", "failed_user");
                context.Faculties.Add(new Faculty
                {
                    Id = row1Id,
                    Name = "Tên Khác Hoàn Toàn",
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "Tester",
                    IsActived = true,
                    IsDeleted = false
                });

                bool saveFailed = false;
                try
                {
                    await context.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    saveFailed = true;
                }
                Require(saveFailed, "Duplicate PK threw DbUpdateException");
            }

            var failureAudits = await capturingInvoker.CollectObservationsAsync(TimeSpan.FromSeconds(1));
            Require(!failureAudits.Any(x => x.IsSuccess), "Failed DB save emitted no success audit");
        }
        finally
        {
            if (tableCreatedByThisRun)
            {
                try
                {
                    using var cleanupConn = new MySqlConnection(connectionString);
                    await cleanupConn.OpenAsync();
                    using var cleanupCmd = cleanupConn.CreateCommand();
                    cleanupCmd.CommandText = "SELECT DATABASE();";
                    var db = (string?)await cleanupCmd.ExecuteScalarAsync();
                    if (string.Equals(db, "blocks_catalogservice_upgrade_test", StringComparison.Ordinal))
                    {
                        cleanupCmd.CommandText = "DROP TABLE `faculty`;";
                        await cleanupCmd.ExecuteNonQueryAsync();
                    }
                    else
                    {
                        throw new InvalidOperationException($"Target database changed to '{db}' during cleanup; aborting drop.");
                    }
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException($"Leftover table report: failed to drop owned 'faculty' table: {ex.Message}", ex);
                }
            }
        }
    }

    private static void SetScopedHttpContext(IServiceScope scope, string auditAction, string path, string userName)
    {
        var httpAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Items["AuditAction"] = auditAction;
        var claims = new[]
        {
            new Claim("name", Guid.NewGuid().ToString()),
            new Claim("unique_name", userName),
            new Claim("role", Guid.NewGuid().ToString())
        };
        var identity = new ClaimsIdentity(claims, "TestAuth", "unique_name", "role");
        context.User = new ClaimsPrincipal(identity);
        httpAccessor.HttpContext = context;
    }

    private sealed class CapturingAuditInvoker : CallInvoker
    {
        private readonly Channel<WriteAuditLogRequest> _channel = Channel.CreateUnbounded<WriteAuditLogRequest>();

        public void Drain()
        {
            while (_channel.Reader.TryRead(out _)) { }
        }

        public async Task<WriteAuditLogRequest> WaitForCaptureAsync(TimeSpan timeout)
        {
            using var cts = new CancellationTokenSource(timeout);
            try
            {
                return await _channel.Reader.ReadAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                throw new TimeoutException($"Timed out waiting for audit log capture after {timeout.TotalSeconds}s");
            }
        }

        public async Task<List<WriteAuditLogRequest>> CollectObservationsAsync(TimeSpan timeout)
        {
            var results = new List<WriteAuditLogRequest>();
            using var cts = new CancellationTokenSource(timeout);
            try
            {
                while (await _channel.Reader.WaitToReadAsync(cts.Token))
                {
                    while (_channel.Reader.TryRead(out var item))
                    {
                        results.Add(item);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Timeout expected on negative checks
            }
            return results;
        }

        public override AsyncUnaryCall<TResponse> AsyncUnaryCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method,
            string? host,
            CallOptions options,
            TRequest request)
        {
            if (request is WriteAuditLogRequest auditReq && typeof(TResponse) == typeof(WriteAuditLogReply))
            {
                var clone = new WriteAuditLogRequest(auditReq);
                _channel.Writer.TryWrite(clone);

                var reply = new WriteAuditLogReply { Success = true };
                var responseTask = Task.FromResult((TResponse)(object)reply);
                return new AsyncUnaryCall<TResponse>(
                    responseTask,
                    Task.FromResult(new Metadata()),
                    () => Status.DefaultSuccess,
                    () => new Metadata(),
                    () => { });
            }

            throw new InvalidOperationException($"Unexpected gRPC method call: {method.Name}");
        }

        public override TResponse BlockingUnaryCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method,
            string? host,
            CallOptions options,
            TRequest request)
        {
            throw new InvalidOperationException($"Unexpected blocking gRPC call: {method.Name}");
        }

        public override AsyncServerStreamingCall<TResponse> AsyncServerStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method,
            string? host,
            CallOptions options,
            TRequest request)
        {
            throw new InvalidOperationException($"Unexpected server streaming call: {method.Name}");
        }

        public override AsyncClientStreamingCall<TRequest, TResponse> AsyncClientStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method,
            string? host,
            CallOptions options)
        {
            throw new InvalidOperationException($"Unexpected client streaming call: {method.Name}");
        }

        public override AsyncDuplexStreamingCall<TRequest, TResponse> AsyncDuplexStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method,
            string? host,
            CallOptions options)
        {
            throw new InvalidOperationException($"Unexpected duplex streaming call: {method.Name}");
        }
    }
}