using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using AutoMapper;

namespace Blocks.SystemService.Services.CoreFeature.User
{
    public class UserProfile : Profile
    {
        public UserProfile()
        {
            CreateMap<Entities.User, ModelUser>().ReverseMap();
            CreateMap<Entities.User, UserRequest>().ReverseMap();
            CreateMap<Entities.User, EditProfileRequest>().ReverseMap();
        }
    }
}
