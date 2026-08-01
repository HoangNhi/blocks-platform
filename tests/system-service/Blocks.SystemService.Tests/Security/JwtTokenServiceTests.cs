using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Infrastructure.Security;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public class JwtTokenServiceTests
{
    [Fact]
    public void GenerateJwtToken_creates_token_with_user_claims()
    {
        var options = Options.Create(new JwtOptions
        {
            Key = "12345678901234567890123456789012",
            Issuer = "blocks-tests",
            Audience = "blocks-api",
            Expiry = 2,
            ExpireRefreshToken = 12
        });

        var service = new JwtTokenService(options);
        var user = new ModelUser
        {
            Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            Username = "demo",
            Email = "demo@example.test",
            RoleId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        };

        var token = service.GenerateJwtToken(user);
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var jwt = handler.ReadJwtToken(token);
        var payload = JsonDocument.Parse(Base64UrlEncoder.Decode(token.Split('.')[1]));

        Assert.Equal("blocks-tests", jwt.Issuer);
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Name && c.Value == user.Id.ToString());
        Assert.Equal("demo", payload.RootElement.GetProperty(JwtRegisteredClaimNames.UniqueName).GetString());
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Email && c.Value == "demo@example.test");
        Assert.Contains(jwt.Claims, c => c.Type == "role" && c.Value == user.RoleId.ToString());
    }

    [Fact]
    public void GenerateRefreshToken_sets_ip_and_expiry()
    {
        var options = Options.Create(new JwtOptions
        {
            Key = "12345678901234567890123456789012",
            Issuer = "blocks-tests",
            Audience = "blocks-api",
            Expiry = 2,
            ExpireRefreshToken = 12
        });

        var service = new JwtTokenService(options);

        var token = service.GenerateRefreshToken("127.0.0.1");

        Assert.Equal("127.0.0.1", token.CreatedByIp);
        Assert.False(string.IsNullOrWhiteSpace(token.Token));
        Assert.True(token.ExpiresAt > DateTime.UtcNow);
    }
}
