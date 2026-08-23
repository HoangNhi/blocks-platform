using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Blocks.FileService.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Blocks.FileService.Tests.Authorization;

public sealed class UploadFileAuthorizationTests
{
    [Fact]
    public async Task Upload_denied_by_authority_returns_403()
    {
        await using var factory = CreateFactory(HttpStatusCode.OK, allow: false);
        using var client = CreateAuthorizedClient(factory);
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("test"), "FolderName");
        content.Add(new ByteArrayContent(Encoding.UTF8.GetBytes("file")), "files", "test.txt");

        using var response = await client.PostAsync("/api/UploadFile", content);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Upload_denied_when_authority_is_unavailable_returns_503()
    {
        await using var factory = CreateFactory(HttpStatusCode.ServiceUnavailable, allow: false);
        using var client = CreateAuthorizedClient(factory);
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("test"), "FolderName");
        content.Add(new ByteArrayContent(Encoding.UTF8.GetBytes("file")), "files", "test.txt");

        using var response = await client.PostAsync("/api/UploadFile", content);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateFactory(HttpStatusCode authorityStatus, bool allow)
    {
        return new FileServiceFactory().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<SystemFunctionalAuthorizationClient>();
                services.AddSingleton<SystemFunctionalAuthorizationClient>(serviceProvider =>
                    new SystemFunctionalAuthorizationClient(
                        new HttpClient(new AuthorityHandler(authorityStatus, allow))
                        {
                            BaseAddress = new Uri("http://systemservice")
                        },
                        serviceProvider.GetRequiredService<IHttpContextAccessor>()));
            }));
    }

    private static HttpClient CreateAuthorizedClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateJwt());
        return client;
    }

    private static string CreateJwt()
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("blocks-file-service-tests-signing-key-32-bytes"));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            issuer: "blocks-tests",
            audience: "blocks-tests",
            claims: [new Claim("name", Guid.NewGuid().ToString())],
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials));
    }

    private sealed class AuthorityHandler(HttpStatusCode statusCode, bool allow) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (statusCode != HttpStatusCode.OK)
            {
                return Task.FromResult(new HttpResponseMessage(statusCode));
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    $"{{\"Success\":true,\"Data\":{{\"HasPermission\":{allow.ToString().ToLowerInvariant()}}}}}",
                    Encoding.UTF8,
                    "application/json")
            });
        }
    }
}
