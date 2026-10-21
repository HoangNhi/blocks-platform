using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Entities;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Blocks.SystemService.Helpers
{
    public static class JWTHelper
    {
        public static string GenerateJwtToken(this IConfiguration Config, ModelUser User)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Config["Jwt:Key"]));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[] {
                new Claim(JwtRegisteredClaimNames.Name, User.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.UniqueName, User.Username),
                new Claim(JwtRegisteredClaimNames.Email, User.Email),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim("role", User.RoleId.ToString()),
            };

            var token = new JwtSecurityToken(
                Config["Jwt:Issuer"],
                Config["Jwt:Audience"],
                claims,
                expires: DateTime.UtcNow.AddHours(int.Parse(Config["Jwt:Expiry"])),
                signingCredentials: credentials
            );

            return tokenHandler.WriteToken(token);
        }

        public static RefreshToken GenerateRefreshToken(this IConfiguration Config, string ipAddress)
        {
            var refreshToken = new RefreshToken
            {
                Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
                ExpiresAt = DateTime.UtcNow.AddHours(double.Parse(Config["Jwt:ExpireRefreshToken"])),
                CreatedAt = DateTime.UtcNow,
                CreatedByIp = ipAddress
            };
            return refreshToken;
        }
    }
}
