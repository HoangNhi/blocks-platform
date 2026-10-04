using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Blocks.Shared.Authorization;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public sealed class WorkloadAuthorizationEndpointTests
{
    private const string ServiceKey = "test-workload-service-key";
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static readonly Guid WorkspaceId = Guid.Parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    [Fact]
    public async Task WorkloadCheck_returns_503_when_service_key_is_not_configured()
    {
        await using var server = await StartServer(new StubAuthorizationService(), configuredKey: "");
        using var request = CreateRequest(serviceKey: null);

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task WorkloadCheck_rejects_overlong_configured_service_key()
    {
        var oversizedKey = new string('k', 513);
        await using var server = await StartServer(
            new StubAuthorizationService(),
            configuredKey: oversizedKey);
        using var request = CreateRequest(serviceKey: oversizedKey);

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task WorkloadCheck_rejects_missing_or_wrong_key_before_model_validation()
    {
        await using var server = await StartServer(new StubAuthorizationService());
        using var missing = CreateRequest(serviceKey: null, body: "not-json");
        using var wrong = CreateRequest(serviceKey: "wrong-key");

        using var missingResponse = await server.Client.SendAsync(missing);
        using var wrongResponse = await server.Client.SendAsync(wrong);

        Assert.Equal(HttpStatusCode.Unauthorized, missingResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongResponse.StatusCode);
    }

    [Fact]
    public async Task WorkloadCheck_rejects_duplicate_service_key_headers()
    {
        await using var server = await StartServer(new StubAuthorizationService());
        using var request = CreateRequest(serviceKey: null);
        request.Headers.TryAddWithoutValidation("X-Service-Authorization", new[] { ServiceKey, ServiceKey });

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task WorkloadCheck_does_not_accept_user_bearer_as_service_key()
    {
        await using var server = await StartServer(new StubAuthorizationService());
        using var request = CreateRequest(serviceKey: null, body: "not-json");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "user-jwt");

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task WorkloadCheck_returns_authoritative_subject_and_permission(bool hasPermission)
    {
        var service = new StubAuthorizationService { HasPermission = hasPermission };
        await using var server = await StartServer(service);
        using var request = CreateRequest();

        using var response = await server.Client.SendAsync(request);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("Data");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(hasPermission, data.GetProperty("HasPermission").GetBoolean());
        Assert.Equal(UserId, data.GetProperty("UserId").GetGuid());
        Assert.Equal(WorkspaceId, data.GetProperty("WorkspaceId").GetGuid());
        Assert.Equal(UserId, service.SeenUserId);
        Assert.Equal(WorkspaceId, service.SeenWorkspaceId);
        Assert.Equal("tradelab.backtests", service.SeenPermissionKey);
        Assert.Equal(FunctionalPermissionAction.ANALYZE, service.SeenAction);
    }

    [Fact]
    public async Task WorkloadCheck_rejects_invalid_actor_scope_permission_and_action()
    {
        var service = new StubAuthorizationService();
        await using var server = await StartServer(service);
        var bodies = new[]
        {
            RequestBody(userId: Guid.Empty),
            RequestBody(workspaceId: Guid.Empty),
            RequestBody(permissionKey: "tradelab.strategies"),
            RequestBody(action: "VIEW"),
            """{"UserId":"not-a-guid"}"""
        };

        foreach (var body in bodies)
        {
            using var request = CreateRequest(body: body);
            using var response = await server.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        Assert.Equal(0, service.CallCount);
    }

    [Fact]
    public async Task WorkloadCheck_returns_503_when_authority_service_throws()
    {
        await using var server = await StartServer(new StubAuthorizationService { ThrowOnCheck = true });
        using var request = CreateRequest();

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task User_authorization_check_still_rejects_requests_without_user_identity()
    {
        await using var server = await StartServer(new StubAuthorizationService());
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/Authorization/check")
        {
            Content = new StringContent(
                """{"PermissionKey":"tradelab.backtests","Action":"ANALYZE"}""",
                Encoding.UTF8,
                "application/json")
        };

        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static string RequestBody(
        Guid? userId = null,
        Guid? workspaceId = null,
        string permissionKey = "tradelab.backtests",
        string action = "ANALYZE") => JsonSerializer.Serialize(new
        {
            UserId = userId ?? UserId,
            WorkspaceId = workspaceId ?? WorkspaceId,
            PermissionKey = permissionKey,
            Action = action
        });

    private static HttpRequestMessage CreateRequest(string? serviceKey = ServiceKey, string? body = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/Authorization/workload-check")
        {
            Content = new StringContent(body ?? RequestBody(), Encoding.UTF8, "application/json")
        };
        if (serviceKey is not null)
        {
            request.Headers.TryAddWithoutValidation("X-Service-Authorization", serviceKey);
        }

        return request;
    }

    private static async Task<RunningServer> StartServer(
        StubAuthorizationService service,
        string? configuredKey = ServiceKey)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(AuthorizationController).Assembly.GetName().Name,
            EnvironmentName = "Production"
        });
        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        builder.Configuration["InternalService:AuthorizationKey"] = configuredKey ?? "";
        builder.Configuration["Jwt:Key"] = "test-jwt-signing-key-for-http-tests-only";
        builder.Configuration["Jwt:Issuer"] = "workload-test-issuer";
        builder.Configuration["Jwt:Audience"] = "workload-test-audience";
        builder.ExecuteConfigAuthentication();
        builder.Services.AddControllers()
            .AddApplicationPart(typeof(AuthorizationController).Assembly)
            .AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton<IFunctionalAuthorizationService>(service);

        var app = builder.Build();
        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        return new RunningServer(app, new HttpClient { BaseAddress = new Uri(address) });
    }

    private sealed class RunningServer(WebApplication app, HttpClient client) : IAsyncDisposable
    {
        public HttpClient Client { get; } = client;

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
        }
    }

    private sealed class StubAuthorizationService : IFunctionalAuthorizationService
    {
        public bool HasPermission { get; init; } = true;
        public bool ThrowOnCheck { get; init; }
        public Guid? SeenUserId { get; private set; }
        public Guid? SeenWorkspaceId { get; private set; }
        public string? SeenPermissionKey { get; private set; }
        public FunctionalPermissionAction? SeenAction { get; private set; }
        public int CallCount { get; private set; }

        public Task<bool> CheckAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            string? controller = null,
            CancellationToken cancellationToken = default) => Task.FromResult(HasPermission);

        public Task<ScopedAuthorizationResult> CheckScopedAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            Guid? workspaceId,
            string? controller = null,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            SeenUserId = userId;
            SeenWorkspaceId = workspaceId;
            SeenPermissionKey = permissionKey;
            SeenAction = action;
            if (ThrowOnCheck)
            {
                throw new InvalidOperationException("authority unavailable");
            }

            return Task.FromResult(new ScopedAuthorizationResult(
                HasPermission,
                userId,
                "test-user",
                workspaceId));
        }
    }
}
