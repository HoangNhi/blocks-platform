using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Requests;

namespace Blocks.CatalogService.Services.CoreFeature.StandardSet
{
    public interface IStandardSetService
    {
        Task<ModelStandardSet> GetById(GetByIdRequest request);
        Task Insert(StandardSetRequest request);
        Task Update(StandardSetRequest request);
        Task DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelStandardSetGetListPaging>> GetList(StandardSetGetListPagingRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
    }
}
