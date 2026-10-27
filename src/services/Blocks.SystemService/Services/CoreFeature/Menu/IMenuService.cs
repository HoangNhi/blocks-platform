using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Requests;

namespace Blocks.SystemService.Services.CoreFeature.Menu
{
    public interface IMenuService
    {
        Task<ModelMenu> GetById(GetByIdRequest request);
        Task<ModelMenu> Insert(MenuRequest request);
        Task<ModelMenu> Update(MenuRequest request);
        Task<string> DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelMenuGetListPaging>> GetList(GetListPagingRequest request);
        Task<List<ModelMenuGetListPaging>> GetListByUser(GetByIdRequest request);
    }
}
