using Blocks.CatalogService.DTOs.CoreFeature.Standard.Criterion.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Criterion.Requests;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.CriterionRequirement.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.CriterionRequirement.Requests;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests;
using AutoMapper;

namespace Blocks.CatalogService.Services.CoreFeature.Standard
{
    public class StandardProfile : Profile
    {
        public StandardProfile()
        {
            CreateMap<Entities.Standard, ModelStandard>().ReverseMap();
            CreateMap<Entities.Standard, StandardRequest>()
                .ReverseMap()
                .ForMember(dest => dest.Criteria, opt => opt.Ignore())
                .ForMember(dest => dest.StandardSet, opt => opt.Ignore());
            CreateMap<Entities.Standard, ModelStandardGetListPaging>().ReverseMap();

            CreateMap<Entities.Criterion, ModelCriterion>().ReverseMap();
            CreateMap<Entities.Criterion, CriterionRequest>()
                .ReverseMap()
                .ForMember(dest => dest.CriterionRequirements, opt => opt.Ignore())
                .ForMember(dest => dest.Standard, opt => opt.Ignore());

            CreateMap<Entities.CriterionRequirement, ModelCriterionRequirement>().ReverseMap();
            CreateMap<Entities.CriterionRequirement, CriterionRequirementRequest>()
                .ReverseMap()
                .ForMember(dest => dest.Criterion, opt => opt.Ignore())
                .ForMember(dest => dest.FileType, opt => opt.Ignore());
        }
    }
}
