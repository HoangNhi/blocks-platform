using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using AutoMapper;

namespace Blocks.CatalogService.Services.CoreFeature.Faculty
{
    public class FacultyProfile : Profile
    {
        public FacultyProfile()
        {
            CreateMap<Entities.Faculty, ModelFaculty>().ReverseMap();
            CreateMap<FacultyRequest, Entities.Faculty>().ReverseMap();
        }
    }
}
