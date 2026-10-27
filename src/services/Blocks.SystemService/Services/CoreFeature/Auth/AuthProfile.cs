using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using AutoMapper;

namespace Blocks.SystemService.Services.CoreFeature.Auth
{
    public class AuthProfile : Profile
    {
        public AuthProfile()
        {
            CreateMap<Entities.User, LoginResponse>().ReverseMap();
            CreateMap<Entities.RefreshToken, ModelRefreshToken>().ReverseMap();
        }
    }
}
