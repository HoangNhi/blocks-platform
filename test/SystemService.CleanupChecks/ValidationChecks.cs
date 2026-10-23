using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Blocks.ServiceDefaults;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Filters;
using Blocks.SystemService.Infrastructure.Services;
using Blocks.SystemService.Middlewares;
using Blocks.SystemService.Services.CoreFeature.Role;
using Blocks.SystemService.Services.CoreFeature.User;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

internal static class ValidationChecks
{
    private const string JwtSecret = "system_validation_test_secret_key_32_bytes_long!!";
    private const string JwtIssuer = "systemservice-cleanup-checks";
    private const string JwtAudience = "systemservice-cleanup-checks";

    public static async Task RunAsync()
    {
        Console.WriteLine("Running SystemService validation characterization checks...");

        await single_error_keeps_vietnamese_envelope();
        await binding_errors_keep_baseline();
        await multiple_errors_keep_first_message();
        await nested_permissions_keep_baseline();
        await unregistered_shared_validator_stays_inactive();
        await permission_precedes_validation();
        await valid_request_reaches_action_once();
        await probe_mvc_annotations_and_prefixes();
        await audit_failure_records_failed_operation();

        Console.WriteLine("PASS SystemService validation characterization checks");
    }

    private static void Require([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Assertion failed: {message}");
        }
    }

    private static string CreateJwt(Guid actorId, string username = "testuser", TimeSpan? lifetime = null, string? key = null)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var lifetimeSpan = lifetime ?? TimeSpan.FromHours(1);
        var expires = DateTime.UtcNow.Add(lifetimeSpan);
        var notBefore = lifetimeSpan < TimeSpan.Zero ? expires.AddHours(-1) : DateTime.UtcNow;
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D")),
                new Claim("unique_name", username)
            }),
            NotBefore = notBefore,
            IssuedAt = notBefore,
            Expires = expires,
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? JwtSecret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private static void ReplaceService<T>(IServiceCollection services, T implementation) where T : class
    {
        var descriptors = services.Where(d => d.ServiceType == typeof(T)).ToList();
        foreach (var d in descriptors)
        {
            services.Remove(d);
        }
        services.AddSingleton<T>(implementation);
    }

    private static async Task<(WebApplication app, FakeRoleService roleService, FakeUserService userService, FakeAuditLogWriter auditWriter)> CreateTestHostAsync()
    {
        var tempContentRoot = Path.Combine(Path.GetTempPath(), "system-val-checks-" + Guid.NewGuid());
        Directory.CreateDirectory(tempContentRoot);

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = Array.Empty<string>(),
            EnvironmentName = Environments.Development,
            ContentRootPath = tempContentRoot
        });

        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Listen(IPAddress.Loopback, 0, listenOptions =>
            {
                listenOptions.Protocols = HttpProtocols.Http1;
            });
        });

        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = JwtSecret,
            ["Jwt:Issuer"] = JwtIssuer,
            ["Jwt:Audience"] = JwtAudience,
            ["ConnectionStrings:System"] = "Host=127.0.0.1;Port=1;Database=unused;Username=x;Password=x;",
            ["GrpcClients:FileService"] = "http://127.0.0.1:1"
        });

        builder.AddServiceDefaults();
        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();

        builder.Services.AddControllers(options =>
        {
            options.Filters.AddService<AuditActionFilter>();
        })
        .AddApplicationPart(typeof(RoleController).Assembly)
        .AddApplicationPart(typeof(ValidationChecks).Assembly)
        .ConfigureApplicationPartManager(m => m.FeatureProviders.Add(new ProbeFeatureProvider()));

        builder.Services.AddEndpointsApiExplorer();

        builder.ExecuteConfigService();
        builder.ExecuteConfigAuthentication();

        var fakeRoleService = new FakeRoleService();
        var fakeUserService = new FakeUserService();
        var fakeAuditWriter = new FakeAuditLogWriter();

        ReplaceService<IRoleService>(builder.Services, fakeRoleService);
        ReplaceService<IUserService>(builder.Services, fakeUserService);
        ReplaceService<IAuditLogWriter>(builder.Services, fakeAuditWriter);

        var app = builder.Build();
        app.UseMiddleware<GlobalExceptionHandler>();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        await app.StartAsync();
        return (app, fakeRoleService, fakeUserService, fakeAuditWriter);
    }

    private static async Task single_error_keeps_vietnamese_envelope()
    {
        var (app, fakeRoleService, fakeUserService, fakeAuditWriter) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            // User insert with only Username empty
            var reqUser = new UserRequest
            {
                Username = "",
                Fullname = "Nguyen Van A",
                Password = "Password123!",
                RoleId = Guid.NewGuid(),
                Email = "valid@example.com",
                AvatarAction = "keep"
            };
            using var respUser = await client.PostAsJsonAsync("/api/User/insert", reqUser);

            Require(respUser.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDocUser = JsonDocument.Parse(await respUser.Content.ReadAsStringAsync());
            var bodyUser = bodyDocUser.RootElement;
            Require(!bodyUser.GetProperty("Success").GetBoolean(), "invalid user request rejected");
            Require(bodyUser.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(bodyUser.GetProperty("Message").GetString() == "Tên tài khoản không được để trống",
                "User single error retained");
            Require(fakeUserService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0,
                "invalid user input has no action side effects or audit");

            // Role insert Name empty
            var reqRole = new RoleRequest { Name = "" };
            using var respRole = await client.PostAsJsonAsync("/api/Role/insert", reqRole);

            Require(respRole.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDocRole = JsonDocument.Parse(await respRole.Content.ReadAsStringAsync());
            var bodyRole = bodyDocRole.RootElement;
            Require(!bodyRole.GetProperty("Success").GetBoolean(), "invalid request rejected");
            Require(bodyRole.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(bodyRole.GetProperty("Message").GetString() == "Tên gọi không được để trống",
                "Role single error retained");
            Require(fakeRoleService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0,
                "invalid input has no action side effects or audit");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task binding_errors_keep_baseline()
    {
        var (app, fakeRoleService, _, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var malformedInputs = new[]
            {
                ("malformed_json", "{\"", "application/json"),
                ("empty_body", "", "application/json"),
                ("json_null", "null", "application/json"),
                ("invalid_guid", "{\"Id\": \"not-a-valid-guid\", \"Name\": \"Test\"}", "application/json")
            };

            foreach (var (testName, payload, contentType) in malformedInputs)
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, "/api/Role/insert");
                request.Content = new StringContent(payload, Encoding.UTF8, contentType);
                using var resp = await client.SendAsync(request);

                Require(resp.StatusCode == HttpStatusCode.OK, $"{testName}: HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), $"{testName}: invalid request rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, $"{testName}: application 400");
                Require(body.TryGetProperty("Message", out var msg) && !string.IsNullOrEmpty(msg.GetString()),
                    $"{testName}: Message populated");
                Require(fakeRoleService.InsertCalls == 0, $"{testName}: no action side effects");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task multiple_errors_keep_first_message()
    {
        var (app, _, _, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            using var req = new HttpRequestMessage(HttpMethod.Post, "/api/User/insert")
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json")
            };
            using var resp = await client.SendAsync(req);

            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(!body.GetProperty("Success").GetBoolean(), "invalid request rejected");
            Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            var actualMsg = body.GetProperty("Message").GetString();
            Require(actualMsg == "Email không được để trống",
                $"First error retained exactly, got '{actualMsg}'");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task nested_permissions_keep_baseline()
    {
        var (app, fakeRoleService, _, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            // Scenario a: Permissions: [] (rejected by root validator)
            {
                var reqPayload = new
                {
                    Permissions = Array.Empty<object>()
                };
                using var resp = await client.PutAsJsonAsync("/api/Role/update-permissions", reqPayload);

                Require(resp.StatusCode == HttpStatusCode.OK, "empty permissions: HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "empty permissions rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, "empty permissions: application 400");
                Require(body.GetProperty("Message").GetString() == "Danh sách phân quyền không được rỗng",
                    "Root validator message retained");
                Require(fakeRoleService.UpdatePermissionsCalls == 0, "no action mutation on root validation failure");
            }

            // Scenario b: One permission with empty RoleId (rejected by child validator)
            {
                var reqPayload = new
                {
                    Permissions = new[]
                    {
                        new { RoleId = Guid.Empty, MenuId = Guid.NewGuid() }
                    }
                };
                using var resp = await client.PutAsJsonAsync("/api/Role/update-permissions", reqPayload);

                Require(resp.StatusCode == HttpStatusCode.OK, "invalid child: HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "invalid child rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, "invalid child: application 400");
                Require(body.GetProperty("Message").GetString() == "Vai trò không được để trống",
                    "Child validator message retained via ImplicitlyValidateChildProperties");
                Require(fakeRoleService.UpdatePermissionsCalls == 0, "no action mutation on child validation failure");
            }

            // Scenario c: Valid Permissions list (passes validation, action called once)
            {
                var reqPayload = new
                {
                    Permissions = new[]
                    {
                        new { RoleId = Guid.NewGuid(), MenuId = Guid.NewGuid() }
                    }
                };
                using var resp = await client.PutAsJsonAsync("/api/Role/update-permissions", reqPayload);

                Require(resp.StatusCode == HttpStatusCode.OK, "valid permissions: HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(body.GetProperty("Success").GetBoolean(), "valid permissions succeeded");
                Require(body.GetProperty("StatusCode").GetInt32() == 200, "valid permissions: application 200");
                Require(fakeRoleService.UpdatePermissionsCalls == 1, "action called exactly once");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task unregistered_shared_validator_stays_inactive()
    {
        var (app, _, fakeUserService, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            using var req = new HttpRequestMessage(HttpMethod.Delete, "/api/User/delete-list")
            {
                Content = new StringContent("{\"Ids\": []}", Encoding.UTF8, "application/json")
            };
            using var resp = await client.SendAsync(req);

            Require(resp.StatusCode == HttpStatusCode.OK, "delete-list HTTP envelope retained");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(body.GetProperty("Success").GetBoolean(),
                "DeleteListRequestValidator from Shared is inactive in SystemService, request succeeds");
            Require(body.GetProperty("StatusCode").GetInt32() == 200, "application 200");
            Require(fakeUserService.DeleteListCalls == 1, "action reaches service exactly once");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task permission_precedes_validation()
    {
        var (app, fakeRoleService, fakeUserService, fakeAuditWriter) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

            // Subcase A: Missing JWT
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Role/insert")
                {
                    Content = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json")
                };
                using var resp = await client.SendAsync(req);
                Require(resp.StatusCode == HttpStatusCode.OK, "401 HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "missing JWT rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 401, "application 401");
                Require(fakeRoleService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0, "no mutation or audit on 401");
            }

            // Subcase B: Expired JWT
            {
                var expiredJwt = CreateJwt(Guid.NewGuid(), lifetime: TimeSpan.FromMinutes(-10));
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Role/insert")
                {
                    Content = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json")
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", expiredJwt);
                using var resp = await client.SendAsync(req);
                Require(resp.StatusCode == HttpStatusCode.OK, "expired JWT HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "expired JWT rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 401, "application 401 on expired token");
                Require(fakeRoleService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0, "no mutation or audit on expired token");
            }

            // Subcase C: Wrong signing key
            {
                var wrongKeyJwt = CreateJwt(Guid.NewGuid(), key: new string('w', 64));
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Role/insert")
                {
                    Content = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json")
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", wrongKeyJwt);
                using var resp = await client.SendAsync(req);
                Require(resp.StatusCode == HttpStatusCode.OK, "wrong key HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "wrong key rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 401, "application 401 on wrong key");
                Require(fakeRoleService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0, "no mutation or audit on wrong key");
            }

            // Subcase D: Valid JWT but permission denied by IUserService.CheckPermission
            {
                fakeUserService.AllowPermission = false;
                var validJwt = CreateJwt(Guid.NewGuid());
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Role/insert")
                {
                    Content = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json")
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", validJwt);
                using var resp = await client.SendAsync(req);
                Require(resp.StatusCode == HttpStatusCode.OK, "403 HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "denied permission rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 403, "application 403 on denied permission");
                Require(fakeRoleService.InsertCalls == 0 && fakeAuditWriter.WriteCalls == 0, "no mutation or audit on 403");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task valid_request_reaches_action_once()
    {
        var (app, fakeRoleService, _, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "system_valid_actor");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var req = new RoleRequest { Name = "Quản trị hệ thống" };
            using var resp = await client.PostAsJsonAsync("/api/Role/insert", req);

            Require(resp.StatusCode == HttpStatusCode.OK, "valid request HTTP 200");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(body.GetProperty("Success").GetBoolean(), "valid request success is true");
            Require(body.GetProperty("StatusCode").GetInt32() == 200, "application 200");
            Require(fakeRoleService.InsertCalls == 1, "action executed exactly once");
            Require(fakeRoleService.LastInsertedName == "Quản trị hệ thống", "payload reached service intact");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task probe_mvc_annotations_and_prefixes()
    {
        var (app, _, _, _) = await CreateTestHostAsync();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

            // 1. DataAnnotations [Required] property (with DisableDataAnnotationsValidation = true in production config)
            {
                using var resp = await client.PostAsJsonAsync("/__checks/probe/required", new { Name = (string?)null });
                Require(resp.StatusCode == HttpStatusCode.OK, "probe [Required] HTTP envelope");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(),
                    "DisableDataAnnotationsValidation leaves [Required] inactive without FluentValidation rule");
            }

            // 2. Implicit required value type (missing int Count defaults to 0)
            {
                using var resp = await client.PostAsJsonAsync("/__checks/probe/implicit-required", new { });
                Require(resp.StatusCode == HttpStatusCode.OK, "probe implicit required HTTP envelope");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(), "implicit required deserializes default");
                Require(doc.RootElement.GetProperty("Data").GetInt32() == 0, "Count defaulted to 0");
            }

            // 3. Two [FromQuery] DTOs with separate prefixes
            {
                using var resp = await client.GetAsync("/__checks/probe/query-prefixes?filter.Keyword=system&paging.PageIndex=7");
                Require(resp.StatusCode == HttpStatusCode.OK, "probe query prefixes HTTP 200");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(), "query prefixes bound successfully");
                var data = doc.RootElement.GetProperty("Data");
                Require(data.GetProperty("filter").GetString() == "system", "filter.Keyword bound correctly");
                Require(data.GetProperty("page").GetInt32() == 7, "paging.PageIndex bound correctly");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task audit_failure_records_failed_operation()
    {
        var (app, fakeRoleService, _, fakeAuditWriter) = await CreateTestHostAsync();
        fakeRoleService.ThrowBusinessExceptionOnInsert = true;

        var actorId = Guid.NewGuid();
        var jwt = CreateJwt(actorId, "system_audit_actor");

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var req = new RoleRequest { Name = "Vai trò thất bại" };
            using var resp = await client.PostAsJsonAsync("/api/Role/insert", req);

            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained on business failure");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(!body.GetProperty("Success").GetBoolean(), "business failure returned");
            Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(body.GetProperty("Message").GetString() == "Vai trò đã tồn tại", "message matches business exception");

            Require(fakeRoleService.InsertCalls == 1, "action executed exactly once");
            Require(fakeAuditWriter.WriteCalls == 1, "audit writer called exactly once on failed operation");

            var lastLog = fakeAuditWriter.WrittenLogs.Last();
            Require(lastLog.UserId == actorId, "actor UserId matches JWT claim");
            Require(lastLog.UserName == "system_audit_actor", "actor UserName matches JWT claim");
            Require(lastLog.ServiceName == "SystemService", "ServiceName is SystemService");
            Require(lastLog.Action == "CREATE", "Action is CREATE");
            Require(lastLog.IsSuccess == false, "IsSuccess is false");
            Require(lastLog.ErrorMessage == "Vai trò đã tồn tại", "ErrorMessage matches business exception");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private sealed class FakeRoleService : IRoleService
    {
        private int _insertCalls;
        private int _updatePermissionsCalls;

        public int InsertCalls => Volatile.Read(ref _insertCalls);
        public int UpdatePermissionsCalls => Volatile.Read(ref _updatePermissionsCalls);
        public string? LastInsertedName { get; private set; }
        public bool ThrowBusinessExceptionOnInsert { get; set; }

        public Task<ModelRole> Insert(RoleRequest request)
        {
            Interlocked.Increment(ref _insertCalls);
            LastInsertedName = request.Name;
            if (ThrowBusinessExceptionOnInsert)
            {
                throw new BusinessException("Vai trò đã tồn tại", 400);
            }
            return Task.FromResult(new ModelRole
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
        }

        public Task<bool> UpdatePermissions(UpdatePermissionsRequest request)
        {
            Interlocked.Increment(ref _updatePermissionsCalls);
            return Task.FromResult(true);
        }

        public Task<ModelRole> GetById(GetByIdRequest request) => throw new NotImplementedException();
        public Task<ModelRole> Update(RoleRequest request) => throw new NotImplementedException();
        public Task<string> DeleteList(DeleteListRequest request) => throw new NotImplementedException();
        public Task<GetListPagingResponse<ModelRoleGetListPaging>> GetList(GetListPagingRequest request) => throw new NotImplementedException();
        public Task<List<ModelPermission>> GetPermissionsByRole(GetByIdRequest request) => throw new NotImplementedException();
        public Task<List<ModelCombobox>> GetAllForCombobox() => throw new NotImplementedException();
        public Task<List<ModelGetPermissionByUser>> GetPermissionsByUser(GetByIdRequest request) => throw new NotImplementedException();
    }

    private sealed class FakeUserService : IUserService
    {
        private int _checkPermissionCalls;
        public int CheckPermissionCalls => Volatile.Read(ref _checkPermissionCalls);
        private int _insertCalls;
        public int InsertCalls => Volatile.Read(ref _insertCalls);
        private int _deleteListCalls;
        public int DeleteListCalls => Volatile.Read(ref _deleteListCalls);
        public bool AllowPermission { get; set; } = true;

        public Task<CheckPermissionReponse> CheckPermission(CheckPermissionRequest request)
        {
            Interlocked.Increment(ref _checkPermissionCalls);
            return Task.FromResult(new CheckPermissionReponse { HasPermission = AllowPermission });
        }

        public Task<ModelUser> GetById(GetByIdRequest request) => throw new NotImplementedException();
        public Task<List<ModelUser>> GetByIds(List<Guid> ids) => throw new NotImplementedException();
        public Task<List<ModelUser>> GetByUsernames(List<string> usernames) => throw new NotImplementedException();
        public Task<GetListPagingResponse<ModelUser>> GetByIdsPaged(List<Guid> ids, string? textSearch, int pageIndex, int pageSize) => throw new NotImplementedException();

        public Task<ModelUser> Insert(UserRequest request)
        {
            Interlocked.Increment(ref _insertCalls);
            return Task.FromResult(new ModelUser
            {
                Id = Guid.NewGuid(),
                Username = request.Username,
                Fullname = request.Fullname,
                Email = request.Email,
                RoleId = request.RoleId,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
        }

        public Task<ModelUser> Update(UserRequest request) => throw new NotImplementedException();

        public Task<string> DeleteList(DeleteListRequest request)
        {
            Interlocked.Increment(ref _deleteListCalls);
            return Task.FromResult("Deleted");
        }

        public Task<GetListPagingResponse<ModelUserGetListPaging>> GetList(GetListPagingRequest request) => throw new NotImplementedException();
        public Task<ModelUser> GetCurrentUser() => throw new NotImplementedException();
        public Task<List<ModelCombobox>> GetAllForCombobox() => throw new NotImplementedException();
        public Task<ModelUser> EditProfile(EditProfileRequest request) => throw new NotImplementedException();
        public Task<ModelUser> ChangePassword(ChangePasswordRequest request) => throw new NotImplementedException();
        public Task<ModelUser> UpdateUserProfileById(Guid userId, string fullname, string username, string email, string? password = null) => throw new NotImplementedException();
    }

    private sealed class FakeAuditLogWriter : IAuditLogWriter
    {
        private readonly List<AuditLog> _writtenLogs = new();
        private int _writeCalls;

        public int WriteCalls => Volatile.Read(ref _writeCalls);
        public IReadOnlyList<AuditLog> WrittenLogs
        {
            get { lock (_writtenLogs) return _writtenLogs.ToList(); }
        }

        public Task WriteAsync(AuditLog auditLog)
        {
            Interlocked.Increment(ref _writeCalls);
            lock (_writtenLogs)
            {
                _writtenLogs.Add(auditLog);
            }
            return Task.CompletedTask;
        }
    }

    private sealed class ProbeFeatureProvider : ControllerFeatureProvider
    {
        protected override bool IsController(System.Reflection.TypeInfo typeInfo)
        {
            if (typeInfo.AsType() == typeof(ValidationProbeController)) return true;
            return base.IsController(typeInfo);
        }
    }

    [ApiController]
    [Route("__checks/probe")]
    [ApiExplorerSettings(IgnoreApi = true)]
    public sealed class ValidationProbeController : ControllerBase
    {
        [HttpPost("required")]
        public IActionResult CheckRequired([FromBody] RequiredModel model) =>
            Ok(new BaseResponse<string> { Data = model.Name, Success = true });

        [HttpPost("implicit-required")]
        public IActionResult CheckImplicitRequired([FromBody] ImplicitRequiredModel model) =>
            Ok(new BaseResponse<int> { Data = model.Count, Success = true });

        [HttpGet("query-prefixes")]
        public IActionResult CheckQueryPrefixes(
            [FromQuery(Name = "filter")] ProbeFilterDto filter,
            [FromQuery(Name = "paging")] ProbePagingDto paging) =>
            Ok(new BaseResponse<object> { Data = new { filter = filter?.Keyword, page = paging?.PageIndex }, Success = true });
    }

    public sealed class RequiredModel
    {
        [Required(ErrorMessage = "Name is required")]
        public string Name { get; set; } = null!;
    }

    public sealed class ImplicitRequiredModel
    {
        public int Count { get; set; }
    }

    public sealed class ProbeFilterDto
    {
        public string? Keyword { get; set; }
    }

    public sealed class ProbePagingDto
    {
        public int PageIndex { get; set; } = 1;
    }
}
