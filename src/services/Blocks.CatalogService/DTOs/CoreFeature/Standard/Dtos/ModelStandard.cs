using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.Dtos
{
    public class ModelStandard : BaseModel
    {
        public Guid Id { get; set; }

        public Guid StandardSetId { get; set; }

        public string Code { get; set; } = null!;

        public string Name { get; set; } = null!;

        public string? Description { get; set; }

        public int Order { get; set; }
    }
}
