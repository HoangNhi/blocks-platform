using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Requests
{
    public class StakeholderGetListPagingRequest : GetListPagingRequest
    {
        public int? Type { get; set; }
    }
}
