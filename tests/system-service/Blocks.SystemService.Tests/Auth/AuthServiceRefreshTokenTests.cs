using AutoMapper;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Security;
using Blocks.SystemService.Services.CoreFeature.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blocks.SystemService.Tests.Auth;

public class AuthServiceRefreshTokenTests
{
    [Fact]
    public async Task RefreshTokenAsync_throws_business_exception_when_token_does_not_exist()
    {
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var context = new SystemContext(options);
        var mapperConfig = new MapperConfigurationExpression();
        mapperConfig.AddMaps(typeof(AuthService).Assembly);
        var mapper = new Mapper(new MapperConfiguration(mapperConfig, NullLoggerFactory.Instance));
        var httpContextAccessor = new HttpContextAccessor();
        var tokenService = new TestJwtTokenService();
        var service = new AuthService(context, mapper, httpContextAccessor, tokenService);

        var exception = await Assert.ThrowsAsync<BusinessException>(() =>
            service.RefreshTokenAsync(new RefreshTokenRequest { RefreshToken = "missing-token" }, "127.0.0.1"));

        Assert.Equal("Token không hợp lệ", exception.Message);
    }

    private sealed class TestJwtTokenService : IJwtTokenService
    {
        public string GenerateJwtToken(Blocks.SystemService.DTOs.CoreFeature.User.Dtos.ModelUser user)
        {
            return "access-token";
        }

        public RefreshToken GenerateRefreshToken(string ipAddress)
        {
            return new RefreshToken
            {
                Id = Guid.NewGuid(),
                Token = "new-refresh-token",
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddHours(1),
                CreatedByIp = ipAddress
            };
        }
    }
}
