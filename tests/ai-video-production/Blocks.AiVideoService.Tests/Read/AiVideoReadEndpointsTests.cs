using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Blocks.AiVideoService.Api;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Read;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Blocks.AiVideoService.Tests.Read;

public class AiVideoReadEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string TestIssuer = "test-issuer";
    private const string TestAudience = "test-audience";
    private static readonly string TestKey = new('t', 32);
    private const string AllowedRoleId = "11111111-1111-1111-1111-111111111111";

    private readonly WebApplicationFactory<Program> _factory;

    public AiVideoReadEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:AiVideo", "Host=localhost;Database=dummy;Username=postgres;Password=postgres");
            builder.UseSetting("Jwt:Issuer", TestIssuer);
            builder.UseSetting("Jwt:Audience", TestAudience);
            builder.UseSetting("Jwt:Key", TestKey);
            builder.UseSetting("AiVideoAccess:ViewRoleIds:0", AllowedRoleId);
            builder.ConfigureTestServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AiVideoDbContext>));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<AiVideoDbContext>(options =>
                    options.UseInMemoryDatabase("AiVideoEndpointsTest"));
            });
        });
    }

    private static HttpClient CreateAuthorizedClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateJwt(AllowedRoleId));
        return client;
    }

    private static string CreateJwt(string roleId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: TestIssuer,
            audience: TestAudience,
            claims: new[]
            {
                new Claim("name", Guid.NewGuid().ToString()),
                new Claim("unique_name", "test-user"),
                new Claim("role", roleId),
            },
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task SeedArtifactAsync(Artifact artifact)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AiVideoDbContext>();
        context.Artifacts.Add(artifact);
        await context.SaveChangesAsync();
    }

    [Fact]
    public async Task GetRuns_ReturnsSuccessEnvelope()
    {
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync("/api/ai-video/runs");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.True(envelope.Success);
    }

    [Fact]
    public async Task GetStatus_ReturnsSuccessEnvelope()
    {
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync("/api/ai-video/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<AiVideoStatusDto>>();
        Assert.NotNull(envelope);
        Assert.True(envelope.Success);
        Assert.Equal("Unknown", envelope.Data!.WorkerStatus);
    }

    [Fact]
    public async Task GetRunDetail_Returns404Envelope_WhenNotFound()
    {
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync("/api/ai-video/runs/missing-run-id");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
    }

    [Fact]
    public async Task GetRunArtifacts_Returns404Envelope_WhenRunMissing()
    {
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync("/api/ai-video/runs/missing-run-id/artifacts");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
    }

    [Fact]
    public async Task GetRuns_Returns401Envelope_WhenAuthorizationHeaderMissing()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/ai-video/runs");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
        Assert.Equal("UNAUTHORIZED", envelope.ErrorCode);
    }

    [Fact]
    public async Task GetRuns_Returns403Envelope_WhenRoleNotAllowlisted()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateJwt("22222222-2222-2222-2222-222222222222"));

        var response = await client.GetAsync("/api/ai-video/runs");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
        Assert.Equal("FORBIDDEN", envelope.ErrorCode);
    }

    [Fact]
    public async Task Preview_Returns415Envelope_WhenMimeUnsupported()
    {
        var artifactId = Guid.NewGuid();
        await SeedArtifactAsync(new Artifact
        {
            Id = artifactId,
            RunId = "run-unsupported-mime",
            StageKey = "collect-news",
            LogicalType = "executable",
            StorageKey = "bin/tool.exe",
            MimeType = "application/x-msdownload",
            Checksum = "sha256-abc",
            Confidence = "rejected",
            Locator = "bin/tool.exe",
            SourceKey = "legacy"
        });
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync($"/api/ai-video/artifacts/{artifactId}/preview");

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
        Assert.Equal("UNSUPPORTED_MIME", envelope.ErrorCode);
    }

    [Fact]
    public async Task Preview_Returns400Envelope_WhenLocatorHasTraversal()
    {
        var artifactId = Guid.NewGuid();
        await SeedArtifactAsync(new Artifact
        {
            Id = artifactId,
            RunId = "run-invalid-locator",
            StageKey = "collect-news",
            LogicalType = "source-json",
            StorageKey = "collect/status.json",
            MimeType = "application/json",
            Checksum = "sha256-abc",
            Confidence = "rejected",
            Locator = "../status.json",
            SourceKey = "legacy"
        });
        var client = CreateAuthorizedClient(_factory);

        var response = await client.GetAsync($"/api/ai-video/artifacts/{artifactId}/preview");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var envelope = await response.Content.ReadFromJsonAsync<AiVideoEnvelope<object>>();
        Assert.NotNull(envelope);
        Assert.False(envelope.Success);
        Assert.Equal("INVALID_LOCATOR", envelope.ErrorCode);
    }

    [Fact]
    public async Task Endpoints_HasNoNonGetMethods()
    {
        var client = CreateAuthorizedClient(_factory);

        var postResponse = await client.PostAsync("/api/ai-video/runs", new StringContent(""));
        var putResponse = await client.PutAsync("/api/ai-video/runs", new StringContent(""));
        var deleteResponse = await client.DeleteAsync("/api/ai-video/runs");

        Assert.True(postResponse.StatusCode == HttpStatusCode.MethodNotAllowed || postResponse.StatusCode == HttpStatusCode.NotFound);
        Assert.True(putResponse.StatusCode == HttpStatusCode.MethodNotAllowed || putResponse.StatusCode == HttpStatusCode.NotFound);
        Assert.True(deleteResponse.StatusCode == HttpStatusCode.MethodNotAllowed || deleteResponse.StatusCode == HttpStatusCode.NotFound);
    }
}
