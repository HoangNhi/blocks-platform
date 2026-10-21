using Blocks.CatalogService.DTOs.CoreFeature.FileType.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.FileType.Requests;
using AutoMapper;

namespace Blocks.CatalogService.Services.CoreFeature.FileType
{
    public class FileTypeProfile : Profile
    {
        public FileTypeProfile()
        {
            CreateMap<Entities.FileType, ModelFileType>().ReverseMap();
            CreateMap<FileTypeRequest, Entities.FileType>().ReverseMap();
        }
    }
}
