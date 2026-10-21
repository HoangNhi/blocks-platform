using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Requests
{
    public class StandardSetGetListPagingRequest : GetListPagingRequest
    {
        public bool? IsActived { get; set; }

        public int? EvaluationMode { get; set; }
    }
}
