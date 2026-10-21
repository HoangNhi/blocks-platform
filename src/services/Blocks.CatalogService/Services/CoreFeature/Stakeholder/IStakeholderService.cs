using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Requests;
using Blocks.CatalogService.Protos;

namespace Blocks.CatalogService.Services.CoreFeature.Stakeholder
{
    public interface IStakeholderService
    {
        #region Chức năng chính
        Task<GetListPagingResponse<ModelStakeholderGetListPaging>> GetList(StakeholderGetListPagingRequest request);
        Task<ModelStakeholder> GetById(GetByIdRequest request);
        Task<ModelStakeholder> Insert(StakeholderRequest request);
        Task<ModelStakeholder> Update(StakeholderRequest request);
        Task<string> DeleteList(DeleteListRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
        #endregion

        #region GRPC
        IAsyncEnumerable<StakeholderInfo> GetStakeholdersStreamAsync(GetStakeholdersStreamRequest request, CancellationToken cancellationToken = default);
        #endregion
    }
}
