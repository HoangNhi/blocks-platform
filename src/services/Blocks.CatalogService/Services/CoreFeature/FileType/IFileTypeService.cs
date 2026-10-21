using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.FileType.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.FileType.Requests;
using Blocks.CatalogService.Protos;

namespace Blocks.CatalogService.Services.CoreFeature.FileType
{
    public interface IFileTypeService
    {
        #region CRUD
        Task<ModelFileType> GetById(GetByIdRequest request);
        Task Insert(FileTypeRequest request);
        Task Update(FileTypeRequest request);
        Task DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelFileType>> GetList(FileTypeGetListPagingRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
        #endregion

        #region GRPC Services
        IAsyncEnumerable<FileTypeInfo> GetFileTypesStreamAsync(
            GetFileTypesStreamRequest request, CancellationToken cancellationToken = default);
        #endregion
    }
}
