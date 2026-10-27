using Blocks.SystemService.DTOs.CoreFeature.Menu.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Requests;
using AutoMapper;

namespace Blocks.SystemService.Services.CoreFeature.Menu
{
    public class MenuProfile : Profile
    {
        public MenuProfile()
        {
            CreateMap<Entities.Menu, ModelMenu>().ReverseMap();
            CreateMap<Entities.Menu, MenuRequest>().ReverseMap();
        }
    }
}
