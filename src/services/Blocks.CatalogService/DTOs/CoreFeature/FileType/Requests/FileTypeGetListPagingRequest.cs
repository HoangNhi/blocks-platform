using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.FileType.Requests
{
    public class FileTypeGetListPagingRequest : GetListPagingRequest
    {
        public bool? IsActived { get; set; }
    }
}
