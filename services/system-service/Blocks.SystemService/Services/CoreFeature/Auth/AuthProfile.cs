using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using AutoMapper;

namespace Blocks.SystemService.Services.CoreFeature.Auth
{
    public class AuthProfile : Profile
    {
        public AuthProfile()
        {
            CreateMap<Entities.User, LoginResponse>().ReverseMap();
        }
    }
}
