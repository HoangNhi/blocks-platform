using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests
{
    public class StandardGetListPagingRequest : GetListPagingRequest
    {
        public Guid? StandardSetId { get; set; }
        public bool? IsActived { get; set; }
    }
}
