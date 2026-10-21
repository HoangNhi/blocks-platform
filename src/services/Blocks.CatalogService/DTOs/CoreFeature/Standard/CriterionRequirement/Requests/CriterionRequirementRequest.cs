using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.CriterionRequirement.Requests
{
    public class CriterionRequirementRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public Guid CriterionId { get; set; }

        public Guid FileTypeId { get; set; }

        public bool IsMandatory { get; set; } = true;

        public int MinQuantity { get; set; }

        public string? Suggestion { get; set; }
    }

    public class CriterionRequirementRequestValidator : AbstractValidator<CriterionRequirementRequest>
    {
        public CriterionRequirementRequestValidator()
        {
            RuleFor(x => x.CriterionId).NotEmpty().WithMessage("Tiêu chí không được để trống");
            RuleFor(x => x.FileTypeId).NotEmpty().WithMessage("Loại tài liệu không được để trống");
            RuleFor(x => x.IsMandatory).NotNull().WithMessage("Bắt buộc phải chọn bắt buộc hoặc không bắt buộc");
            RuleFor(x => x.MinQuantity).GreaterThanOrEqualTo(0).WithMessage("Số lượng tối thiểu phải lớn hơn hoặc bằng 0");
        }
    }
}
