using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;

namespace Blocks.SystemService.Services.CoreFeature.Auth
{
    public interface IAuthService
    {
        Task<LoginResponse> LoginAsync(LoginRequest request, string ipAddress);
        Task<ModelToken> RefreshTokenAsync(RefreshTokenRequest request, string ipAddress);
    }
}
