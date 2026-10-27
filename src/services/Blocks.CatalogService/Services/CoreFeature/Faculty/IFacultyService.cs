using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;

namespace Blocks.CatalogService.Services.CoreFeature.Faculty
{
    public interface IFacultyService
    {
        Task<ModelFaculty> GetById(GetByIdRequest request);
        Task<ModelFaculty> Insert(FacultyRequest request);
        Task<ModelFaculty> Update(FacultyRequest request);
        Task<string> DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelFaculty>> GetList(GetListPagingRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
    }
}
