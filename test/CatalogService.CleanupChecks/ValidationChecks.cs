using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Blocks.CatalogService.Entities;
using AutoMapper;
using Blocks.CatalogService.Configs;
using Blocks.CatalogService.Controllers;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Infrastructure.Filters;
using Blocks.CatalogService.Middlewares;
using Blocks.CatalogService.Services.CoreFeature.Faculty;
using Blocks.ServiceDefaults;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using FluentValidation;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

internal static class ValidationChecks
{
    private const string JwtSecret = "catalog_validation_test_secret_key_32_bytes_long!!";
    private const string JwtIssuer = "catalogservice-cleanup-checks";
    private const string JwtAudience = "catalogservice-cleanup-checks";

    public static async Task RunAsync()
    {
        Console.WriteLine("Running CatalogService validation characterization checks...");

        await single_error_keeps_vietnamese_envelope();
        await binding_errors_keep_baseline();
        await multiple_errors_keep_first_message();
        await permission_precedes_validation();
        await valid_request_reaches_action_once();
        await probe_mvc_annotations_and_prefixes();
        await audit_retry_success_and_terminal_failure_keep_baseline();
        await async_validator_is_awaited_once();
        await request_abort_reaches_validator();
        await validator_infrastructure_error_is_not_input400();
        await dataannotations_stay_disabled();
        await two_dtos_query_prefixes_and_no_double_validation();
        await automapper_maps_faculty_and_date_converters();
        await grpc_web_auth_header_and_version();

        Console.WriteLine("PASS CatalogService validation characterization checks");
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

    private static async Task<(WebApplication app, FakeFacultyService service, TestLogSink logSink, ValidationProbeState probeState)> CreateTestHostAsync(
        CatalogEphemeralResponder? responder = null)
    {
        var tempContentRoot = Path.Combine(Path.GetTempPath(), "catalog-val-checks-" + Guid.NewGuid());
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
            ["ConnectionStrings:Catalog"] = "Server=127.0.0.1;Port=1;Database=unused;Uid=x;Pwd=x;",
            ["GrpcClients:SystemService"] = responder?.Url ?? "http://127.0.0.1:1"
        });

        var logSink = new TestLogSink();
        builder.Logging.AddProvider(logSink);

        builder.AddServiceDefaults();
        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();

        var probeState = new ValidationProbeState();
        builder.Services.AddSingleton(probeState);
        builder.Services.AddScoped<IValidator<AsyncProbeDto>, AsyncProbeValidator>();
        builder.Services.AddScoped<IValidator<CancelProbeDto>, CancelProbeValidator>();
        builder.Services.AddScoped<IValidator<InfraErrorProbeDto>, InfraErrorProbeValidator>();
        builder.Services.AddScoped<IValidator<TwoDtosProbeDto>, TwoDtosProbeValidator>();

        builder.Services.AddControllers(options =>
        {
            options.Filters.AddService<AuditActionFilter>();
            options.ModelValidatorProviders.Add(new TestCustomModelValidatorProvider(probeState));
        })
        .AddApplicationPart(typeof(FacultyController).Assembly)
        .AddApplicationPart(typeof(ValidationChecks).Assembly)
        .ConfigureApplicationPartManager(m => m.FeatureProviders.Add(new ProbeFeatureProvider()));

        builder.Services.AddEndpointsApiExplorer();

        builder.ExecuteConfigService();
        builder.ExecuteConfigAuthentication();

        builder.Services.Configure<ApiBehaviorOptions>(options =>
        {
            var existingFactory = options.InvalidModelStateResponseFactory;
            options.InvalidModelStateResponseFactory = context =>
            {
                lock (probeState.LastModelStateKeys)
                {
                    probeState.LastModelStateKeys.Clear();
                    probeState.LastModelStateKeys.AddRange(context.ModelState.Keys);
                }
                return existingFactory != null
                    ? existingFactory(context)
                    : new OkObjectResult(new BaseResponse(false, 400, Blocks.Shared.Common.CommonFunc.GetModelStateAPI(context.ModelState)));
            };
        });

        var fakeFacultyService = new FakeFacultyService();
        var descriptor = builder.Services.FirstOrDefault(d => d.ServiceType == typeof(IFacultyService));
        if (descriptor != null) builder.Services.Remove(descriptor);
        builder.Services.AddSingleton<IFacultyService>(fakeFacultyService);

        var app = builder.Build();
        app.UseMiddleware<GlobalExceptionHandler>();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        await app.StartAsync();
        return (app, fakeFacultyService, logSink, probeState);
    }

    private static async Task single_error_keeps_vietnamese_envelope()
    {
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        responder.AllowPermission = true;
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var req = new FacultyRequest { Name = "" };
            using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);

            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(!body.GetProperty("Success").GetBoolean(), "invalid request rejected");
            Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(body.GetProperty("Message").GetString() == "Tên phòng ban không được để trống",
                "Faculty single error retained");
            Require(fakeService.InsertCalls == 0 && responder.AuditCalls == 0,
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
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        responder.AllowPermission = true;
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);

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
                using var request = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert");
                request.Content = new StringContent(payload, Encoding.UTF8, contentType);
                using var resp = await client.SendAsync(request);

                Require(resp.StatusCode == HttpStatusCode.OK, $"{testName}: HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), $"{testName}: invalid request rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, $"{testName}: application 400");
                Require(body.TryGetProperty("Message", out var msg) && !string.IsNullOrEmpty(msg.GetString()),
                    $"{testName}: Message populated");
                Require(fakeService.InsertCalls == 0, $"{testName}: no action side effects");
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
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        responder.AllowPermission = true;
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var jwt = CreateJwt(Guid.NewGuid());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert")
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json")
            };
            using var resp = await client.SendAsync(req);

            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(!body.GetProperty("Success").GetBoolean(), "invalid request rejected");
            Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(body.GetProperty("Message").GetString() == "Tên phòng ban không được để trống",
                "First error retained exactly, not ProblemDetails array");
            Require(fakeService.InsertCalls == 0, "no action mutation");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task permission_precedes_validation()
    {
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var invalidPayload = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json");

            // Subcase A: Missing JWT
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert")
                {
                    Content = new StringContent("{\"Name\": \"\"}", Encoding.UTF8, "application/json")
                };
                using var resp = await client.SendAsync(req);
                Require(resp.StatusCode == HttpStatusCode.OK, "401 HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "missing JWT rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 401, "application 401");
                Require(fakeService.InsertCalls == 0 && responder.AuditCalls == 0, "no mutation or audit on 401");
            }

            // Subcase B: Expired JWT
            {
                var expiredJwt = CreateJwt(Guid.NewGuid(), lifetime: TimeSpan.FromMinutes(-10));
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert")
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
                Require(fakeService.InsertCalls == 0 && responder.AuditCalls == 0, "no mutation or audit on expired token");
            }

            // Subcase C: Wrong signing key
            {
                var wrongKeyJwt = CreateJwt(Guid.NewGuid(), key: new string('w', 64));
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert")
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
                Require(fakeService.InsertCalls == 0 && responder.AuditCalls == 0, "no mutation or audit on wrong key");
            }

            // Subcase D: Valid JWT but permission denied by System gRPC
            {
                responder.AllowPermission = false;
                var validJwt = CreateJwt(Guid.NewGuid());
                using var req = new HttpRequestMessage(HttpMethod.Post, "/api/Faculty/insert")
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
                Require(fakeService.InsertCalls == 0 && responder.AuditCalls == 0, "no mutation or audit on 403");
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
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        responder.AllowPermission = true;
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "catalog_valid_actor");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var req = new FacultyRequest { Name = "Khoa Công Nghệ Thông Tin" };
            using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);

            Require(resp.StatusCode == HttpStatusCode.OK, "valid request HTTP 200");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(body.GetProperty("Success").GetBoolean(), "valid request success is true");
            Require(body.GetProperty("StatusCode").GetInt32() == 200, "application 200");
            Require(fakeService.InsertCalls == 1, "action executed exactly once");
            Require(fakeService.LastInsertedName == "Khoa Công Nghệ Thông Tin", "payload reached service intact");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task probe_mvc_annotations_and_prefixes()
    {
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        var (app, _, _, _) = await CreateTestHostAsync(responder);

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
                using var resp = await client.GetAsync("/__checks/probe/query-prefixes?filter.Keyword=cs&paging.PageIndex=5");
                Require(resp.StatusCode == HttpStatusCode.OK, "probe query prefixes HTTP 200");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(), "query prefixes bound successfully");
                var data = doc.RootElement.GetProperty("Data");
                Require(data.GetProperty("filter").GetString() == "cs", "filter.Keyword bound correctly");
                Require(data.GetProperty("page").GetInt32() == 5, "paging.PageIndex bound correctly");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task audit_retry_success_and_terminal_failure_keep_baseline()
    {
        // Subcase 1: Retry success (call 1 fails with grpc-status 14, call 2 succeeds with grpc-status 0)
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(callIndex =>
                callIndex == 1 ? StatusCode.Unavailable : StatusCode.OK);
            responder.AllowPermission = true;

            var (app, fakeService, _, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_retry_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa Toan Tin" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained on business failure");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(!bodyDoc.RootElement.GetProperty("Success").GetBoolean(), "business failure returned");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once, not replayed on retry");

                var reqs = responder.ReceivedAuditRequests;
                Require(reqs.Count > 0, "request captured");
                var lastReq = reqs.Last();
                Require(lastReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(lastReq.UserName == "cat_retry_actor", "actor UserName matches JWT claim");
                Require(lastReq.ServiceName == "CatalogService", "ServiceName is CatalogService");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }

        // Subcase 2: Terminal failure (all calls fail with grpc-status 14 -> 3 retries, total 4 attempts)
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(_ => StatusCode.Unavailable);
            responder.AllowPermission = true;

            var (app, fakeService, logSink, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_terminal_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa Vat Ly" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");

                var completedAllAttempts = await responder.WaitForCallsAsync(4, TimeSpan.FromSeconds(30));
                Require(completedAllAttempts, $"expected 4 transport attempts before terminal giveup, got {responder.AuditCalls}");
                Require(responder.AuditCalls == 4, $"total transport attempts must be exactly 4, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once, not replayed on failure");

                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(5) && !logSink.HasMessage("AUDIT LOG LOST"))
                {
                    await Task.Delay(50);
                }
                Require(logSink.HasMessage("AUDIT LOG LOST"), "terminal failure must log AUDIT LOG LOST");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }

        // Subcase 3: Upstream HTTP 503 then HTTP 200
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)503 : StatusCode.OK);
            responder.AllowPermission = true;

            var (app, fakeService, _, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_503_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa Hoa Hoc" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after HTTP 503");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }

        // Subcase 4: Connection disconnect/abort then HTTP 200
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)999 : StatusCode.OK);
            responder.AllowPermission = true;

            var (app, fakeService, _, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_abort_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa Sinh Hoc" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after connection abort");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }

        // Subcase 5: Terminal failure with persistent HTTP 503 (4 attempts -> AUDIT LOG LOST)
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(_ => (StatusCode)503);
            responder.AllowPermission = true;

            var (app, fakeService, logSink, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_503_term_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa 503 Terminal" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");

                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(60) && !logSink.HasMessage("AUDIT LOG LOST"))
                {
                    await Task.Delay(50);
                }
                Require(logSink.HasMessage("AUDIT LOG LOST"), $"persistent HTTP 503 must log AUDIT LOG LOST within timeout, calls so far: {responder.AuditCalls}");
                Require(responder.AuditCalls >= 4, $"total transport attempts must be at least 4 on persistent HTTP 503, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once, not replayed on failure");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }

        // Subcase 6: Terminal failure with persistent connection abort (all attempts abort -> AUDIT LOG LOST)
        {
            await using var responder = await CatalogEphemeralResponder.StartAsync(_ => (StatusCode)999);
            responder.AllowPermission = true;

            var (app, fakeService, logSink, _) = await CreateTestHostAsync(responder);
            fakeService.ThrowBusinessExceptionOnInsert = true;

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "cat_abort_term_actor");

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var req = new FacultyRequest { Name = "Khoa Abort Terminal" };
                using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");

                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(60) && !logSink.HasMessage("AUDIT LOG LOST"))
                {
                    await Task.Delay(50);
                }
                Require(logSink.HasMessage("AUDIT LOG LOST"), $"persistent connection abort must log AUDIT LOG LOST within timeout, calls so far: {responder.AuditCalls}");
                Require(responder.AuditCalls >= 4, $"total transport attempts must be at least 4 on connection abort, got {responder.AuditCalls}");
                Require(fakeService.InsertCalls == 1, "action executed exactly once, not replayed on failure");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await app.StopAsync();
                await app.DisposeAsync();
            }
        }
    }

    private static async Task async_validator_is_awaited_once()
    {
        var (app, _, _, state) = await CreateTestHostAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            using var resp = await client.PostAsJsonAsync("/__checks/probe/async-validation", new AsyncProbeDto { Value = "invalid" });

            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(!body.GetProperty("Success").GetBoolean(), "invalid input rejected");
            Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
            Require(body.GetProperty("Message").GetString() == "Async validation failed", "async validator message retained");
            Require(state.AsyncRuleCalls == 1 && state.MutationCalls == 0, "async rule awaited once");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task request_abort_reaches_validator()
    {
        var (app, _, _, state) = await CreateTestHostAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            using var cts = new CancellationTokenSource();
            using var req = new HttpRequestMessage(HttpMethod.Post, "/__checks/probe/cancel-validation")
            {
                Content = new StringContent("{\"Value\":\"cancel\"}", Encoding.UTF8, "application/json")
            };
            var sendTask = client.SendAsync(req, cts.Token);
            var started = await Task.WhenAny(state.CancelStarted.Task, Task.Delay(5000));
            Require(started == state.CancelStarted.Task, "validator started before cancel");

            cts.Cancel();
            try
            {
                await sendTask;
            }
            catch (Exception)
            {
            }

            var sw = Stopwatch.StartNew();
            while (sw.Elapsed < TimeSpan.FromSeconds(3) && !state.CancelledTokenObserved)
            {
                await Task.Delay(20);
            }

            Require(state.CancelledTokenObserved && state.MutationCalls == 0, "request cancellation propagated");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task validator_infrastructure_error_is_not_input400()
    {
        var (app, _, _, state) = await CreateTestHostAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            using var resp = await client.PostAsJsonAsync("/__checks/probe/infra-error", new InfraErrorProbeDto { Value = "test" });

            using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var body = bodyDoc.RootElement;
            Require(state.MutationCalls == 0, "mutation calls 0 on infra error");
            Require(!body.GetProperty("Success").GetBoolean(), "failure returned");
            Require(body.GetProperty("StatusCode").GetInt32() != 400, "infrastructure failure not input error");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task dataannotations_stay_disabled()
    {
        var (app, _, _, state) = await CreateTestHostAsync();
        try
        {
            // Verify resolved MvcOptions from DI confirms DataAnnotations provider removed and implicit required suppressed
            var mvcOptions = app.Services.GetRequiredService<IOptions<MvcOptions>>().Value;
            Require(!mvcOptions.ModelValidatorProviders.Any(p => p.GetType().FullName == "Microsoft.AspNetCore.Mvc.DataAnnotations.DataAnnotationsModelValidatorProvider"),
                "DataAnnotationsModelValidatorProvider must be pruned from resolved MvcOptions");
            Require(mvcOptions.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes == true,
                "SuppressImplicitRequiredAttributeForNonNullableReferenceTypes must be true in resolved MvcOptions");
            Require(mvcOptions.ModelValidatorProviders.Count > 0,
                "Other model validator providers (including custom providers) must be retained");

            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

            // 1. [Required] probe
            using (var resp = await client.PostAsJsonAsync("/__checks/probe/required", new { Name = (string?)null }))
            {
                Require(resp.StatusCode == HttpStatusCode.OK, "probe [Required] HTTP envelope");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(),
                    "DisableDataAnnotationsValidation leaves [Required] inactive without FluentValidation rule");
            }

            // 2. Custom model validator provider retained
            using (var resp = await client.PostAsJsonAsync("/__checks/probe/custom-provider", new CustomProviderProbeDto { Value = "test" }))
            {
                Require(resp.StatusCode == HttpStatusCode.OK, "custom provider probe HTTP 200");
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Require(doc.RootElement.GetProperty("Success").GetBoolean(), "custom provider probe success");
                Require(state.CustomProviderCalls > 0, "custom model validator provider was retained and executed");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task two_dtos_query_prefixes_and_no_double_validation()
    {
        var (app, _, _, state) = await CreateTestHostAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };

            // Subcase A: first valid, second invalid -> error on second
            {
                using var resp = await client.GetAsync("/__checks/probe/two-dtos?first.Value=hello&second.Value=");
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "invalid second dto rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
                Require(body.GetProperty("Message").GetString() == "Giá trị không được để trống", "error message retained");
                Require(state.MutationCalls == 0, "no action mutation on failure");
                lock (state.LastModelStateKeys)
                {
                    Require(state.LastModelStateKeys.Contains("second.Value") || state.LastModelStateKeys.Contains("second"),
                        "error key matches second parameter prefix");
                }
            }

            // Subcase B: first invalid, second valid -> error on first
            {
                using var resp = await client.GetAsync("/__checks/probe/two-dtos?first.Value=&second.Value=world");
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(!body.GetProperty("Success").GetBoolean(), "invalid first dto rejected");
                Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
                Require(body.GetProperty("Message").GetString() == "Giá trị không được để trống", "error message retained");
                Require(state.MutationCalls == 0, "no action mutation on failure");
                lock (state.LastModelStateKeys)
                {
                    Require(state.LastModelStateKeys.Contains("first.Value") || state.LastModelStateKeys.Contains("first"),
                        "error key matches first parameter prefix");
                }
            }

            // Subcase C: both valid -> success, action called once, exactly 2 validation executions
            {
                state.TwoDtosValidationCalls = 0;
                using var resp = await client.GetAsync("/__checks/probe/two-dtos?first.Value=hello&second.Value=world");
                Require(resp.StatusCode == HttpStatusCode.OK, "HTTP 200 on valid inputs");
                using var bodyDoc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var body = bodyDoc.RootElement;
                Require(body.GetProperty("Success").GetBoolean(), "both dtos valid succeeded");
                Require(body.GetProperty("StatusCode").GetInt32() == 200, "application 200");
                Require(state.MutationCalls == 1, "action called exactly once");
                Require(state.TwoDtosValidationCalls == 2, "both parameters validated once without double validation");
            }
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task automapper_maps_faculty_and_date_converters()
    {
        var (app, _, _, _) = await CreateTestHostAsync();
        try
        {
            var mapper = app.Services.GetRequiredService<IMapper>();

            var facultyId = Guid.NewGuid();
            var faculty = new Faculty
            {
                Id = facultyId,
                Name = "Khoa Cong nghe thong tin",
                IsActived = true
            };
            var modelFaculty = mapper.Map<ModelFaculty>(faculty);
            Require(modelFaculty.Id == facultyId, "Faculty -> ModelFaculty Id preserved");
            Require(modelFaculty.Name == "Khoa Cong nghe thong tin", "Faculty -> ModelFaculty Name preserved");
            Require(modelFaculty.IsActived == true, "Faculty -> ModelFaculty IsActived preserved");

            var facultyReq = new FacultyRequest
            {
                Id = facultyId,
                Name = "Khoa Dien"
            };
            var mappedFaculty = mapper.Map<Faculty>(facultyReq);
            Require(mappedFaculty.Id == facultyId, "FacultyRequest -> Faculty Id preserved");
            Require(mappedFaculty.Name == "Khoa Dien", "FacultyRequest -> Faculty Name preserved");

            var dt = new DateTime(2026, 10, 23, 0, 0, 0, DateTimeKind.Unspecified);
            var dateOnly = new DateOnly(2026, 10, 23);

            var convertedDt = mapper.Map<DateOnly?, DateTime?>(dateOnly);
            Require(convertedDt == dt, "DateOnly? -> DateTime? matches");

            var convertedDateOnly = mapper.Map<DateTime?, DateOnly?>(dt);
            Require(convertedDateOnly == dateOnly, "DateTime? -> DateOnly? matches");

            Require(mapper.Map<DateOnly?, DateTime?>(null) == null, "null DateOnly? -> null DateTime?");
            Require(mapper.Map<DateTime?, DateOnly?>(null) == null, "null DateTime? -> null DateOnly?");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static async Task grpc_web_auth_header_and_version()
    {
        await using var responder = await CatalogEphemeralResponder.StartAsync();
        responder.AllowPermission = true;
        var (app, fakeService, _, _) = await CreateTestHostAsync(responder);
        fakeService.ThrowBusinessExceptionOnInsert = true;

        try
        {
            var jwt = CreateJwt(Guid.NewGuid());
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var req = new FacultyRequest { Name = "Khoa Toan" };
            using var resp = await client.PostAsJsonAsync("/api/Faculty/insert", req);
            Require(resp.StatusCode == HttpStatusCode.OK, "HTTP 200 on faculty insert");

            var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
            Require(delivered, "audit delivered via gRPC-Web");

            Require(responder.LastPermissionProtocol == "HTTP/1.1", $"permission protocol HTTP/1.1, got {responder.LastPermissionProtocol}");
            Require(responder.LastPermissionAuthHeader == $"Bearer {jwt}", "permission x-service-authorization propagated");
            Require(responder.LastAuditProtocol == "HTTP/1.1", $"audit protocol HTTP/1.1, got {responder.LastAuditProtocol}");
            Require(responder.LastAuditAuthHeader == $"Bearer {jwt}", "audit x-service-authorization propagated");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private sealed class FakeFacultyService : IFacultyService
    {
        private int _insertCalls;
        public int InsertCalls => Volatile.Read(ref _insertCalls);
        public string? LastInsertedName { get; private set; }
        public bool ThrowBusinessExceptionOnInsert { get; set; }

        public Task<ModelFaculty> Insert(FacultyRequest request)
        {
            Interlocked.Increment(ref _insertCalls);
            LastInsertedName = request.Name;
            if (ThrowBusinessExceptionOnInsert)
            {
                throw new BusinessException("Phòng ban đã tồn tại", 400);
            }
            return Task.FromResult(new ModelFaculty
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test",
                IsActived = true
            });
        }

        public Task<ModelFaculty> GetById(GetByIdRequest request) => throw new NotImplementedException();
        public Task<ModelFaculty> Update(FacultyRequest request) => throw new NotImplementedException();
        public Task<string> DeleteList(DeleteListRequest request) => throw new NotImplementedException();
        public Task<GetListPagingResponse<ModelFaculty>> GetList(GetListPagingRequest request) => throw new NotImplementedException();
        public Task<List<ModelCombobox>> GetAllForCombobox() => throw new NotImplementedException();
    }

    private sealed class CatalogEphemeralResponder : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private readonly TaskCompletionSource<bool> _auditReceived = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly List<Blocks.SystemService.Protos.WriteAuditLogRequest> _receivedAuditRequests = new();
        private int _auditCalls;
        private int _permissionCalls;
        private int _inFlight;

        public string Url { get; private set; } = string.Empty;
        public int AuditCalls => Volatile.Read(ref _auditCalls);
        public int PermissionCalls => Volatile.Read(ref _permissionCalls);
        public bool AllowPermission { get; set; } = true;
        public string? LastPermissionProtocol { get; private set; }
        public string? LastPermissionAuthHeader { get; private set; }
        public string? LastAuditProtocol { get; private set; }
        public string? LastAuditAuthHeader { get; private set; }

        public Task<bool> WaitForAuditAsync(TimeSpan timeout) =>
            Task.WhenAny(_auditReceived.Task, Task.Delay(timeout)).ContinueWith(t => _auditReceived.Task.IsCompletedSuccessfully && _auditReceived.Task.Result);

        public IReadOnlyList<Blocks.SystemService.Protos.WriteAuditLogRequest> ReceivedAuditRequests
        {
            get { lock (_receivedAuditRequests) return _receivedAuditRequests.ToList(); }
        }

        private CatalogEphemeralResponder(WebApplication app)
        {
            _app = app;
        }

        public static Task<CatalogEphemeralResponder> StartAsync() =>
            StartAsync(_ => StatusCode.OK);

        public static async Task<CatalogEphemeralResponder> StartAsync(Func<int, StatusCode> statusForCall)
        {
            var builder = WebApplication.CreateBuilder(new[] { "--urls", "http://127.0.0.1:0" });
            var app = builder.Build();
            var responder = new CatalogEphemeralResponder(app);

            app.MapPost("/system.SystemProto/CheckPermission", async context =>
            {
                Interlocked.Increment(ref responder._permissionCalls);
                responder.LastPermissionProtocol = context.Request.Protocol;
                responder.LastPermissionAuthHeader = context.Request.Headers["x-service-authorization"].ToString();
                context.Response.ContentType = "application/grpc-web";

                var reply = new Blocks.SystemService.Protos.CheckActionResponse { Success = responder.AllowPermission };
                var replyBytes = Google.Protobuf.MessageExtensions.ToByteArray(reply);
                var trailerBytes = Encoding.ASCII.GetBytes("grpc-status:0\r\n");

                var body = new byte[5 + replyBytes.Length + 5 + trailerBytes.Length];
                body[0] = 0;
                System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(1, 4), replyBytes.Length);
                replyBytes.CopyTo(body.AsSpan(5));

                var tOffset = 5 + replyBytes.Length;
                body[tOffset] = 0x80;
                System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(tOffset + 1, 4), trailerBytes.Length);
                trailerBytes.CopyTo(body.AsSpan(tOffset + 5));

                await context.Response.Body.WriteAsync(body);
            });

            app.MapPost("/audit.AuditProto/WriteAuditLog", async context =>
            {
                Interlocked.Increment(ref responder._inFlight);
                try
                {
                    var callIndex = Interlocked.Increment(ref responder._auditCalls);
                    var statusCode = statusForCall(callIndex);
                    responder.LastAuditProtocol = context.Request.Protocol;
                    responder.LastAuditAuthHeader = context.Request.Headers["x-service-authorization"].ToString();

                    if ((int)statusCode == 503)
                    {
                        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                        context.Response.ContentType = "text/plain";
                        await context.Response.WriteAsync("Service Unavailable");
                        return;
                    }
                    if ((int)statusCode == 999)
                    {
                        context.Abort();
                        return;
                    }

                    try
                    {
                        var ms = new MemoryStream();
                        await context.Request.Body.CopyToAsync(ms);
                        var bytes = ms.ToArray();
                        if (bytes.Length >= 5)
                        {
                            var length = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(1, 4));
                            if (bytes.Length >= 5 + length)
                            {
                                var reqBytes = bytes.AsSpan(5, length).ToArray();
                                var req = Blocks.SystemService.Protos.WriteAuditLogRequest.Parser.ParseFrom(reqBytes);
                                lock (responder._receivedAuditRequests)
                                {
                                    responder._receivedAuditRequests.Add(req);
                                }
                            }
                        }
                    }
                    catch { }

                    context.Response.ContentType = "application/grpc-web";

                    if (statusCode == StatusCode.OK)
                    {
                        var reply = new Blocks.SystemService.Protos.WriteAuditLogReply { Success = true, Message = "ok" };
                        var replyBytes = Google.Protobuf.MessageExtensions.ToByteArray(reply);
                        var trailerBytes = Encoding.ASCII.GetBytes("grpc-status:0\r\n");

                        var body = new byte[5 + replyBytes.Length + 5 + trailerBytes.Length];
                        body[0] = 0;
                        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(1, 4), replyBytes.Length);
                        replyBytes.CopyTo(body.AsSpan(5));

                        var tOffset = 5 + replyBytes.Length;
                        body[tOffset] = 0x80;
                        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(tOffset + 1, 4), trailerBytes.Length);
                        trailerBytes.CopyTo(body.AsSpan(tOffset + 5));

                        await context.Response.Body.WriteAsync(body);
                        responder._auditReceived.TrySetResult(true);
                    }
                    else
                    {
                        var trailerBytes = Encoding.ASCII.GetBytes($"grpc-status:{(int)statusCode}\r\ngrpc-message:{statusCode}\r\n");
                        var body = new byte[5 + trailerBytes.Length];
                        body[0] = 0x80;
                        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(body.AsSpan(1, 4), trailerBytes.Length);
                        trailerBytes.CopyTo(body.AsSpan(5));

                        await context.Response.Body.WriteAsync(body);
                    }
                }
                finally
                {
                    Interlocked.Decrement(ref responder._inFlight);
                }
            });

            await app.StartAsync();
            responder.Url = app.Urls.First();
            return responder;
        }

        public async Task<bool> WaitForCallAsync(TimeSpan timeout)
        {
            var delayTask = Task.Delay(timeout);
            var completed = await Task.WhenAny(_auditReceived.Task, delayTask);
            return completed == _auditReceived.Task;
        }

        public async Task<bool> WaitForCallsAsync(int count, TimeSpan timeout)
        {
            var sw = Stopwatch.StartNew();
            while (sw.Elapsed < timeout)
            {
                if (Volatile.Read(ref _auditCalls) >= count) return true;
                await Task.Delay(20);
            }
            return Volatile.Read(ref _auditCalls) >= count;
        }

        public async Task DrainAsync(TimeSpan timeout)
        {
            var sw = Stopwatch.StartNew();
            while (sw.Elapsed < timeout && Volatile.Read(ref _inFlight) > 0)
            {
                await Task.Delay(20);
            }
        }

        public async ValueTask DisposeAsync()
        {
            await DrainAsync(TimeSpan.FromSeconds(2));
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }

    private sealed class TestLogSink : ILoggerProvider, ILogger
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> _messages = new();
        public bool HasMessage(string fragment) =>
            _messages.Any(m => m.Contains(fragment, StringComparison.OrdinalIgnoreCase));
        public ILogger CreateLogger(string categoryName) => this;
        public void Dispose() { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var msg = formatter(state, exception);
            if (exception != null) msg += " " + exception.Message;
            _messages.Enqueue(msg);
        }
    }

    private sealed class ProbeFeatureProvider : Microsoft.AspNetCore.Mvc.Controllers.ControllerFeatureProvider
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
        private readonly ValidationProbeState _state;

        public ValidationProbeController(ValidationProbeState state)
        {
            _state = state;
        }

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

        [HttpPost("async-validation")]
        public IActionResult CheckAsync([FromBody] AsyncProbeDto dto)
        {
            Interlocked.Increment(ref _state.MutationCalls);
            return Ok(new BaseResponse<string> { Data = dto.Value, Success = true });
        }

        [HttpPost("cancel-validation")]
        public IActionResult CheckCancel([FromBody] CancelProbeDto dto)
        {
            Interlocked.Increment(ref _state.MutationCalls);
            return Ok(new BaseResponse<string> { Data = dto.Value, Success = true });
        }

        [HttpPost("infra-error")]
        public IActionResult CheckInfraError([FromBody] InfraErrorProbeDto dto)
        {
            Interlocked.Increment(ref _state.MutationCalls);
            return Ok(new BaseResponse<string> { Data = dto.Value, Success = true });
        }

        [HttpGet("two-dtos")]
        public IActionResult CheckTwoDtos(
            [FromQuery(Name = "first")] TwoDtosProbeDto first,
            [FromQuery(Name = "second")] TwoDtosProbeDto second)
        {
            Interlocked.Increment(ref _state.MutationCalls);
            return Ok(new BaseResponse<object> { Data = new { first = first?.Value, second = second?.Value }, Success = true });
        }

        [HttpPost("custom-provider")]
        public IActionResult CheckCustomProvider([FromBody] CustomProviderProbeDto dto)
        {
            Interlocked.Increment(ref _state.MutationCalls);
            return Ok(new BaseResponse<string> { Data = dto.Value, Success = true });
        }
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

    public sealed class ValidationProbeState
    {
        public int AsyncRuleCalls;
        public int MutationCalls;
        public int CustomProviderCalls;
        public int TwoDtosValidationCalls;
        public bool CancelledTokenObserved;
        public readonly TaskCompletionSource<bool> CancelStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly List<string> LastModelStateKeys = new();
    }

    public sealed class AsyncProbeDto
    {
        public string? Value { get; set; }
    }

    public sealed class AsyncProbeValidator : AbstractValidator<AsyncProbeDto>
    {
        public AsyncProbeValidator(ValidationProbeState state)
        {
            RuleFor(x => x.Value).MustAsync(async (val, ct) =>
            {
                Interlocked.Increment(ref state.AsyncRuleCalls);
                await Task.Delay(20, ct);
                return val == "valid";
            }).WithMessage("Async validation failed");
        }
    }

    public sealed class CancelProbeDto
    {
        public string? Value { get; set; }
    }

    public sealed class CancelProbeValidator : AbstractValidator<CancelProbeDto>
    {
        public CancelProbeValidator(ValidationProbeState state)
        {
            RuleFor(x => x.Value).MustAsync(async (val, ct) =>
            {
                state.CancelStarted.TrySetResult(true);
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(10), ct);
                    return true;
                }
                catch (OperationCanceledException)
                {
                    state.CancelledTokenObserved = true;
                    throw;
                }
            });
        }
    }

    public sealed class InfraErrorProbeDto
    {
        public string? Value { get; set; }
    }

    public sealed class InfraErrorProbeValidator : AbstractValidator<InfraErrorProbeDto>
    {
        public InfraErrorProbeValidator()
        {
            RuleFor(x => x.Value).Custom((val, context) =>
            {
                throw new InvalidOperationException("DB connection broken in validator");
            });
        }
    }

    public sealed class TwoDtosProbeDto
    {
        public string? Value { get; set; }
    }

    public sealed class TwoDtosProbeValidator : AbstractValidator<TwoDtosProbeDto>
    {
        public TwoDtosProbeValidator(ValidationProbeState state)
        {
            RuleFor(x => x.Value)
                .NotEmpty().WithMessage("Giá trị không được để trống")
                .Must((dto, val) =>
                {
                    Interlocked.Increment(ref state.TwoDtosValidationCalls);
                    return true;
                });
        }
    }

    public sealed class CustomProviderProbeDto
    {
        public string? Value { get; set; }
    }

    public sealed class TestCustomModelValidatorProvider : Microsoft.AspNetCore.Mvc.ModelBinding.Validation.IModelValidatorProvider
    {
        private readonly ValidationProbeState _state;
        public TestCustomModelValidatorProvider(ValidationProbeState state) => _state = state;

        public void CreateValidators(Microsoft.AspNetCore.Mvc.ModelBinding.Validation.ModelValidatorProviderContext context)
        {
            if (context.ModelMetadata.ModelType == typeof(CustomProviderProbeDto))
            {
                Interlocked.Increment(ref _state.CustomProviderCalls);
            }
        }
    }
}
