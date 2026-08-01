using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Entities;

namespace Blocks.SystemService.Infrastructure.Security;

public interface IJwtTokenService
{
    string GenerateJwtToken(ModelUser user);

    RefreshToken GenerateRefreshToken(string ipAddress);
}
