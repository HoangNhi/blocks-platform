using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Requests;
using AutoMapper;

namespace Blocks.CatalogService.Services.CoreFeature.Stakeholder
{
    public class StakeholderProfile : Profile
    {
        public StakeholderProfile()
        {
            CreateMap<Entities.Stakeholder, ModelStakeholder>();
            CreateMap<Entities.Stakeholder, ModelStakeholderGetListPaging>();
            CreateMap<StakeholderRequest, Entities.Stakeholder>();
        }
    }
}
