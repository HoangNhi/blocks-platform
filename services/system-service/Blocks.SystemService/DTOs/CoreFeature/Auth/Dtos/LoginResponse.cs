using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;

namespace Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos
{
    public class LoginResponse : ModelAuthenticatedUser
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
    }
}
