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
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
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

    internal static string SanitizeMessage(Exception? ex)
    {
        if (ex == null) return "Unknown error";

        var msg = ex.Message ?? "";
        if (ContainsSensitiveKeywords(msg))
        {
            return $"[{ex.GetType().Name}] Redacted error containing sensitive credentials";
        }

        if (ex is InvalidOperationException &&
            (msg.StartsWith("Assertion failed:", StringComparison.Ordinal) ||
             msg.StartsWith("CATALOGSERVICE_UPGRADE_TEST_CONNECTION", StringComparison.Ordinal) ||
             msg.StartsWith("Probe refused:", StringComparison.Ordinal) ||
             msg.StartsWith("Leftover table report:", StringComparison.Ordinal) ||
             msg.StartsWith("Connection string", StringComparison.Ordinal) ||
             msg.StartsWith("Connection host", StringComparison.Ordinal) ||
             msg.StartsWith("Database must be", StringComparison.Ordinal) ||
             msg.StartsWith("Protocol must be", StringComparison.Ordinal) ||
             msg.StartsWith("Named pipes", StringComparison.Ordinal) ||
             msg.StartsWith("Preexisting", StringComparison.Ordinal) ||
             msg.StartsWith("Target database", StringComparison.Ordinal)))
        {
            return msg;
        }

        return $"[{ex.GetType().Name}] Database or driver operation failed";
    }

    private static bool ContainsSensitiveKeywords(string text)
    {
        return text.IndexOf("pwd", StringComparison.OrdinalIgnoreCase) >= 0 ||
               text.IndexOf("password", StringComparison.OrdinalIgnoreCase) >= 0 ||
               text.IndexOf("uid", StringComparison.OrdinalIgnoreCase) >= 0 ||
               text.IndexOf("secret", StringComparison.OrdinalIgnoreCase) >= 0;
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
        exception_sanitization_masks_driver_and_credentials();
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

    private static void exception_sanitization_masks_driver_and_credentials()
    {
        const string secretPass = "super_secret_test_password";
        var credentialEx = new InvalidOperationException($"Failed to connect Server=127.0.0.1;Uid=admin;Pwd={secretPass};Database=test");
        var sanitizedCred = SanitizeMessage(credentialEx);
        Require(!sanitizedCred.Contains(secretPass), "Sanitized message must not contain password");
        Require(!sanitizedCred.Contains("admin"), "Sanitized message must not contain username");

                var driverEx = (MySqlException)Activator.CreateInstance(
            typeof(MySqlException),
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance,
            null,
            new object[] { "Access denied for user 'root'@'localhost' (using password: YES)" },
            null)!;
        var sanitizedDriver = SanitizeMessage(driverEx);
        Require(!sanitizedDriver.Contains("root"), "Driver error must not leak user");
        Require(sanitizedDriver.StartsWith("[MySqlException]"), "Driver error includes generic exception type");

        var safeAssertionEx = new InvalidOperationException("Assertion failed: TotalRow == 3");
        Require(SanitizeMessage(safeAssertionEx) == safeAssertionEx.Message, "Safe assertion message preserved");

        var safeEnvEx = new InvalidOperationException("CATALOGSERVICE_UPGRADE_TEST_CONNECTION environment variable is not configured. Live database checks require an isolated test database.");
        Require(SanitizeMessage(safeEnvEx) == safeEnvEx.Message, "Safe env refusal message preserved");
    }
    private static async Task<bool> TryEnsureEmptyDatabaseAndCreateFacultyAsync(string connectionString, bool takeOwnership)
    {
        ValidateIsolatedConnection(connectionString);

        using var conn = new MySqlConnection(connectionString);
        await conn.OpenAsync();
        using (var tzCmd = conn.CreateCommand())
        {
            tzCmd.CommandText = "SET time_zone = '+00:00';";
            await tzCmd.ExecuteNonQueryAsync();
        }

        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT DATABASE();";
            var currentDb = (string?)await cmd.ExecuteScalarAsync();
            Require(string.Equals(currentDb, "blocks_catalogservice_upgrade_test", StringComparison.Ordinal),
                "Target database must be blocks_catalogservice_upgrade_test");

            cmd.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();";
            var tableCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());
            if (tableCount > 0)
            {
                throw new InvalidOperationException($"Preexisting database objects rejected: found {tableCount} table(s) in database");
            }

            cmd.CommandText = "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE();";
            var viewCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());
            if (viewCount > 0)
            {
                throw new InvalidOperationException($"Preexisting database objects rejected: found {viewCount} view(s) in database");
            }

            if (takeOwnership)
            {
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
                return true;
            }

            return false;
        }
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
        Exception? primaryException = null;

        try
        {
            // Step 1: Ensure empty database and create owned faculty table
            tableCreatedByThisRun = await TryEnsureEmptyDatabaseAndCreateFacultyAsync(connectionString, takeOwnership: true);

            // Step 2: Server metadata and deterministic timezone inspection
            using (var metaConn = new MySqlConnection(connectionString))
            {
                await metaConn.OpenAsync();
                using var tzCmd = metaConn.CreateCommand();
                tzCmd.CommandText = "SET time_zone = '+00:00';";
                await tzCmd.ExecuteNonQueryAsync();

                using var metaCmd = metaConn.CreateCommand();
                metaCmd.CommandText = "SELECT VERSION(), @@version_comment, @@session.time_zone, @@global.time_zone, @@system_time_zone;";
                using var reader = await metaCmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Server metadata query returned rows");
                var version = reader.GetString(0);
                var comment = reader.GetString(1);
                var sessionTz = reader.GetString(2);
                var globalTz = reader.GetString(3);
                var systemTz = reader.GetString(4);
                Require(!string.IsNullOrEmpty(version), "Server version is non-empty");
                Require(!string.IsNullOrEmpty(comment), "Server comment is non-empty");
                Require(!string.IsNullOrEmpty(sessionTz), "Session time_zone is non-empty");
                Require(!string.IsNullOrEmpty(globalTz), "Global time_zone is non-empty");
                Require(!string.IsNullOrEmpty(systemTz), "System time_zone is non-empty");
            }

            // Step 3: Lifecycle assertions - real refusal probe against populated database
            bool probeRefused = false;
            bool probeTookOwnership = false;
            try
            {
                probeTookOwnership = await TryEnsureEmptyDatabaseAndCreateFacultyAsync(connectionString, takeOwnership: false);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("Preexisting database objects rejected"))
            {
                probeRefused = true;
            }
            Require(probeRefused, "Probe refused when database is not empty");
            Require(!probeTookOwnership, "Probe must not acquire ownership on refusal");

            // Verify faculty table and structure intact after probe refusal
            using (var verifyConn = new MySqlConnection(connectionString))
            {
                await verifyConn.OpenAsync();
                using var verifyCmd = verifyConn.CreateCommand();
                verifyCmd.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'faculty';";
                var count = Convert.ToInt64(await verifyCmd.ExecuteScalarAsync());
                Require(count == 1, "Faculty table remains intact after probe refusal");
            }

            // Step 4: WebApplication fixture with capturing audit invoker
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
            var row5Id = Guid.NewGuid(); // Omitted updated_at row

            using (var seedConn = new MySqlConnection(connectionString))
            {
                await seedConn.OpenAsync();
                using var tzCmd = seedConn.CreateCommand();
                tzCmd.CommandText = "SET time_zone = '+00:00';";
                await tzCmd.ExecuteNonQueryAsync();

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

                // Test omitted updated_at column in SQL to observe DB default CURRENT_TIMESTAMP
                using var omitCmd = seedConn.CreateCommand();
                omitCmd.CommandText = @"
INSERT INTO `faculty` (`id`, `name`, `created_at`, `created_by`, `is_actived`, `is_deleted`)
VALUES (@id5, 'Ban Khảo sát', '2026-10-22 00:00:05', 'SeedActor', 1, 0);";
                omitCmd.Parameters.AddWithValue("@id5", row5Id.ToString());
                await omitCmd.ExecuteNonQueryAsync();
            }

            // Verify omitted updated_at got populated by DB default, while row 1 explicit NULL stayed NULL
            using (var seedConn = new MySqlConnection(connectionString))
            {
                await seedConn.OpenAsync();
                using var tzCmd = seedConn.CreateCommand();
                tzCmd.CommandText = "SET time_zone = '+00:00';";
                await tzCmd.ExecuteNonQueryAsync();

                using var checkCmd = seedConn.CreateCommand();
                checkCmd.CommandText = "SELECT id, updated_at FROM `faculty` WHERE id IN (@id1, @id5);";
                checkCmd.Parameters.AddWithValue("@id1", row1Id.ToString());
                checkCmd.Parameters.AddWithValue("@id5", row5Id.ToString());
                using var reader = await checkCmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var id = reader.GetString(0);
                    if (id == row1Id.ToString())
                    {
                        Require(reader.IsDBNull(1), "Explicit NULL updated_at in row 1 remains NULL");
                    }
                    else if (id == row5Id.ToString())
                    {
                        Require(!reader.IsDBNull(1), "Omitted updated_at in row 5 populated by DB default CURRENT_TIMESTAMP");
                    }
                }
            }

            // Raw stored flag check (tinyint(1) values 0/1)
            using (var seedConn = new MySqlConnection(connectionString))
            {
                await seedConn.OpenAsync();
                using var flagCmd = seedConn.CreateCommand();
                flagCmd.CommandText = "SELECT is_actived, is_deleted FROM `faculty` WHERE id = @id1;";
                flagCmd.Parameters.AddWithValue("@id1", row1Id.ToString());
                using var reader = await flagCmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Row 1 exists for raw flag check");
                Require(Convert.ToInt32(reader["is_actived"]) == 1, "Raw is_actived tinyint(1) is 1");
                Require(Convert.ToInt32(reader["is_deleted"]) == 0, "Raw is_deleted tinyint(1) is 0");
            }
            // Test 1: unicode_search_paging_and_duplicate_name (checked on seeded 3 'Phòng' rows)
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
            }

            // Test 2: uuid_sql_to_ef_and_service_to_sql with fresh-context and actor checks
            const string testUserId = "00000000-0000-0000-0000-00000000000a";
            const string testUserName = "actor_test_user";

            // char(36) UUID read unchanged in fresh context
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var loaded = await context.Faculties.FindAsync(row1Id);
                Require(loaded != null && loaded.Id == row1Id, "Raw char(36) UUID read unchanged");
            }

            // Caller-specified UUID and CREATE audit validation
            var callerId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var inserted = await service.Insert(new FacultyRequest { Id = callerId, Name = "Ban Khảo thí" });
                Require(inserted.Id == callerId, "Caller UUID retained");
                var createAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(createAudit.Action == "CREATE", "CREATE audit action verified");
                Require(createAudit.EntityId == callerId.ToString(), "CREATE audit EntityId matches callerId");
                Require(createAudit.UserId == testUserId, "CREATE audit UserId matches actor");
                Require(createAudit.UserName == testUserName, "CREATE audit UserName matches actor");
                Require(string.IsNullOrEmpty(createAudit.OldValues), "CREATE audit OldValues is empty");
                Require(!string.IsNullOrEmpty(createAudit.NewValues) && createAudit.NewValues.Contains(callerId.ToString()),
                    "CREATE audit NewValues contains inserted entity ID");
            }

            // Fresh context reload check for caller insert & actor
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var reloadedCaller = await context.Faculties.FindAsync(callerId);
                Require(reloadedCaller != null, "Caller row reloaded from fresh context");
                Require(reloadedCaller!.CreatedBy == testUserName, "CreatedBy persisted from actor identity");
            }

            // Raw SQL reload check for caller insert
            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT created_by, is_actived, is_deleted FROM `faculty` WHERE id = @id;";
                cmd.Parameters.AddWithValue("@id", callerId.ToString());
                using var reader = await cmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Caller row found in raw SQL");
                Require(reader.GetString(0) == testUserName, "Raw SQL created_by matches actor");
                Require(Convert.ToInt32(reader["is_actived"]) == 1, "Raw SQL is_actived is 1");
                Require(Convert.ToInt32(reader["is_deleted"]) == 0, "Raw SQL is_deleted is 0");
            }

            // Empty request ID generated
            Guid generatedId;
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var generated = await service.Insert(new FacultyRequest { Id = Guid.Empty, Name = "Ban Thanh tra" });
                Require(generated.Id != Guid.Empty, "Empty request ID generated");
                generatedId = generated.Id;
                var genAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(genAudit.EntityId == generatedId.ToString(), "Generated ID audit captured");
            }

            // Test 3: update excluding own ID and UPDATE audit payload validation
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "UPDATE", "/api/Faculty/update", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var updatedSelf = await service.Update(new FacultyRequest
                {
                    Id = row1Id,
                    Name = "Phòng Công nghệ",
                    IsActived = true
                });
                Require(updatedSelf.Id == row1Id, "Updating self with same name succeeds");
                var updateAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(updateAudit.Action == "UPDATE", "UPDATE audit action verified");
                Require(updateAudit.EntityId == row1Id.ToString(), "UPDATE audit EntityId matches updated row");
                Require(updateAudit.UserId == testUserId, "UPDATE audit UserId matches actor");
                Require(updateAudit.UserName == testUserName, "UPDATE audit UserName matches actor");
                Require(!string.IsNullOrEmpty(updateAudit.OldValues), "UPDATE audit OldValues populated");
                Require(!string.IsNullOrEmpty(updateAudit.NewValues), "UPDATE audit NewValues populated");
            }

            // Fresh context reload check for update
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var reloadedUpdated = await context.Faculties.FindAsync(row1Id);
                Require(reloadedUpdated != null && reloadedUpdated!.UpdatedBy == testUserName,
                    "UpdatedBy persisted from actor identity in fresh context");
            }
            // Test 4: flags_defaults_null_and_timestamp_roundtrip
            var inactiveId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var inactive = await service.Insert(new FacultyRequest
                {
                    Id = inactiveId,
                    Name = "Ban Tạm ngưng",
                    IsActived = false
                });
                Require(inactive.IsActived == false, "Explicit false survives DB default true");
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
            }

            // Raw SQL check for inactive row
            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT is_actived, is_deleted FROM `faculty` WHERE id = @id;";
                cmd.Parameters.AddWithValue("@id", inactiveId.ToString());
                using var reader = await cmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Inactive row found in raw SQL");
                Require(Convert.ToInt32(reader["is_actived"]) == 0, "Raw is_actived is 0 for explicit false");
                Require(Convert.ToInt32(reader["is_deleted"]) == 0, "Raw is_deleted is 0");
            }

            // Test entity IsActived = null directly and assert persisted default true on reload
            var nullActiveId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var nullActiveFaculty = new Faculty
                {
                    Id = nullActiveId,
                    Name = "Ban Chưa gán cờ",
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "DirectContext",
                    IsActived = null,
                    IsDeleted = false
                };
                await context.Faculties.AddAsync(nullActiveFaculty);
                await context.SaveChangesAsync();
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
            }

            // Fresh context reload check for IsActived = null
            using (var scope = app.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();
                var reloadedNull = await context.Faculties.FindAsync(nullActiveId);
                Require(reloadedNull != null && reloadedNull.IsActived == true,
                    "Persisted default true for null IsActived in fresh context");
            }

            // Raw SQL reload check for IsActived = null
            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT is_actived, is_deleted FROM `faculty` WHERE id = @id;";
                cmd.Parameters.AddWithValue("@id", nullActiveId.ToString());
                using var reader = await cmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Null active row found in raw SQL");
                Require(Convert.ToInt32(reader["is_actived"]) == 1, "Raw is_actived tinyint(1) default is 1");
                Require(Convert.ToInt32(reader["is_deleted"]) == 0, "Raw is_deleted tinyint(1) default is 0");
            }

            // DI-resolved MVC JsonOptions & DB timestamp round-trip
            var mvcJsonOptions = app.Services.GetRequiredService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>().Value.JsonSerializerOptions;

            using (var scope = app.Services.CreateScope())
            {
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var row1Dto = await service.GetById(new GetByIdRequest { Id = row1Id });
                var serializedRow1 = JsonSerializer.Serialize(row1Dto, mvcJsonOptions);
                Require(serializedRow1.Contains("\"CreatedAt\":\"2026-10-22T07:00:01\""),
                    "DB timestamp round-trip: 2026-10-22 00:00:01Z serialized through MVC JsonOptions as 2026-10-22T07:00:01");
            }

            var sampleDto = new ModelFaculty
            {
                Id = Guid.NewGuid(),
                Name = "Time Test",
                CreatedAt = DateTime.SpecifyKind(new DateTime(2026, 10, 22, 0, 0, 0), DateTimeKind.Utc)
            };
            var serializedSample = JsonSerializer.Serialize(sampleDto, mvcJsonOptions);
            Require(serializedSample.Contains("\"CreatedAt\":\"2026-10-22T07:00:00\""),
                "Fixed 2026-10-22T00:00:00Z becomes 2026-10-22T07:00:00");

            // Test 5: successful soft-delete, raw row retention, excluded from GetList & GetAllForCombobox, and DELETE audit
            var deleteTargetId = Guid.NewGuid();
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                await service.Insert(new FacultyRequest { Id = deleteTargetId, Name = "Ban Xóa mềm" });
                await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
            }

            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "DELETE", "/api/Faculty/delete-list", testUserId, testUserName);
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var deleteResult = await service.DeleteList(new DeleteListRequest { Ids = new List<Guid> { deleteTargetId } });
                Require(deleteResult.Contains(deleteTargetId.ToString()), "DeleteList returns deleted ID");
                var deleteAudit = await capturingInvoker.WaitForCaptureAsync(TimeSpan.FromSeconds(5));
                Require(deleteAudit.Action == "DELETE", "DELETE audit action verified");
                Require(deleteAudit.EntityId == deleteTargetId.ToString(), "DELETE audit EntityId matches deleted ID");
                Require(deleteAudit.UserId == testUserId, "DELETE audit UserId matches actor");
                Require(deleteAudit.UserName == testUserName, "DELETE audit UserName matches actor");
                Require(!string.IsNullOrEmpty(deleteAudit.OldValues), "DELETE audit OldValues is populated");
            }

            // Raw SQL check: soft-deleted row retained with is_deleted = 1
            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT is_deleted, updated_by FROM `faculty` WHERE id = @id;";
                cmd.Parameters.AddWithValue("@id", deleteTargetId.ToString());
                using var reader = await cmd.ExecuteReaderAsync();
                Require(await reader.ReadAsync(), "Soft-deleted row retained in raw SQL");
                Require(Convert.ToInt32(reader["is_deleted"]) == 1, "Raw is_deleted is 1 for soft-deleted row");
                Require(reader.GetString(1) == testUserName, "Raw updated_by matches deleter username");
            }

            // Paging & combobox exclude deleted row; combobox excludes inactive row and is sorted
            using (var scope = app.Services.CreateScope())
            {
                var service = scope.ServiceProvider.GetRequiredService<IFacultyService>();
                var pagingAfterDelete = await service.GetList(new GetListPagingRequest
                {
                    TextSearch = "Ban Xóa mềm",
                    PageIndex = 1,
                    PageSize = 10
                });
                Require(pagingAfterDelete.TotalRow == 0, "Soft-deleted row excluded from GetList");

                var combobox = await service.GetAllForCombobox();
                Require(combobox.All(c => c.Value != deleteTargetId.ToString()), "Combobox excludes soft-deleted row");
                Require(combobox.All(c => c.Value != inactiveId.ToString()), "Combobox excludes inactive row");
                Require(combobox.Select(c => c.Text).SequenceEqual(combobox.Select(c => c.Text).OrderBy(x => x)),
                    "Combobox ordered alphabetically");
            }
            // Test 6: failed_batch_and_failed_save_never_succeed
            using (var scope = app.Services.CreateScope())
            {
                SetScopedHttpContext(scope, "DELETE", "/api/Faculty/delete-list", testUserId, testUserName);
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
                SetScopedHttpContext(scope, "CREATE", "/api/Faculty/insert", testUserId, "failed_user");
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
        catch (Exception ex)
        {
            primaryException = ex;
            throw;
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
                catch (Exception cleanupEx)
                {
                    var sanitizedCleanupMsg = SanitizeMessage(cleanupEx);
                    if (primaryException != null)
                    {
                        Console.Error.WriteLine($"Leftover table report: failed to drop owned 'faculty' table: {sanitizedCleanupMsg}");
                    }
                    else
                    {
                        throw new InvalidOperationException($"Leftover table report: failed to drop owned 'faculty' table: {sanitizedCleanupMsg}");
                    }
                }
            }
        }
    }

    private static void SetScopedHttpContext(IServiceScope scope, string auditAction, string path, string userId, string userName)
    {
        var httpAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Items["AuditAction"] = auditAction;
        var claims = new[]
        {
            new Claim("name", userId),
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