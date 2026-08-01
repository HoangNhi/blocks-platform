using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Blocks.SystemService.Infrastructure.Security;

public sealed class JwtTokenService : IJwtTokenService
{
    private readonly JwtOptions _options;

    public JwtTokenService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
    }

    public string GenerateJwtToken(ModelUser user)
    {
        var issuedAt = DateTimeOffset.UtcNow;
        var header = new Dictionary<string, object>
        {
            ["alg"] = SecurityAlgorithms.HmacSha256,
            ["typ"] = "JWT"
        };

        var payload = new Dictionary<string, object?>
        {
            ["iss"] = _options.Issuer,
            ["aud"] = _options.Audience,
            ["name"] = user.Id.ToString(),
            ["unique_name"] = user.Username ?? string.Empty,
            ["email"] = user.Email ?? string.Empty,
            ["jti"] = Guid.NewGuid().ToString(),
            ["role"] = user.RoleId.ToString(),
            ["iat"] = issuedAt.ToUnixTimeSeconds(),
            ["nbf"] = issuedAt.ToUnixTimeSeconds(),
            ["exp"] = issuedAt.AddHours(_options.Expiry).ToUnixTimeSeconds()
        };

        var encodedHeader = Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(header));
        var encodedPayload = Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(payload));
        var unsignedToken = string.Join('.', encodedHeader, encodedPayload);

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_options.Key));
        var signature = hmac.ComputeHash(Encoding.UTF8.GetBytes(unsignedToken));

        return string.Join('.', unsignedToken, Base64UrlEncoder.Encode(signature));
    }

    public RefreshToken GenerateRefreshToken(string ipAddress)
    {
        return new RefreshToken
        {
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.AddHours(_options.ExpireRefreshToken),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = ipAddress
        };
    }
}
