using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests;
using Blocks.CatalogService.Protos;

namespace Blocks.CatalogService.Services.CoreFeature.Standard
{
    public interface IStandardService
    {
        Task<StandardRequest> GetById(GetByIdRequest request);
        Task Insert(StandardRequest request);
        Task Update(StandardRequest request);
        Task DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelStandardGetListPaging>> GetList(StandardGetListPagingRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
        Task<List<StandardRequest>> GetListWithCriteria(GetListStandardWithCriteriaRequest request);
        Task<List<ModelStandard>> GetByStandardSetId(Guid standardSetId);

        // gRPC Services
        IAsyncEnumerable<CriterionInfo> GetCriterionsForEvidenceStreamAsync(
            GetCriterionsForEvidenceStreamRequest request,
            CancellationToken cancellationToken = default);

        IAsyncEnumerable<StandardWithCriteriaInfo> GetStandardsWithCriteriaStreamAsync(
            GetStandardsWithCriteriaStreamRequest request,
            CancellationToken cancellationToken = default);

        IAsyncEnumerable<FileTypeInfo> GetFileTypesByCriterionStreamAsync(
            GetFileTypesByCriterionStreamRequest request,
            CancellationToken cancellationToken = default);
    }
}
