using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Requests;
using AutoMapper;

namespace Blocks.SystemService.Services.CoreFeature.SystemGroup
{
    public class SystemGroupProfile : Profile
    {
        public SystemGroupProfile()
        {
            CreateMap<Entities.SystemGroup, ModelSystemGroup>().ReverseMap();
            CreateMap<Entities.SystemGroup, SystemGroupRequest>().ReverseMap();
        }
    }
}
