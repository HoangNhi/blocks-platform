using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.CriterionRequirement.Dtos
{
    public class ModelCriterionRequirement : BaseModel
    {
        public Guid Id { get; set; }

        public Guid CriterionId { get; set; }

        public Guid FileTypeId { get; set; }

        public bool IsMandatory { get; set; }

        public int MinQuantity { get; set; }

        public string? Suggestion { get; set; }
    }
}
