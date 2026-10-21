using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Criterion.Requests;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests
{
    public class StandardRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public Guid StandardSetId { get; set; }

        public string Code { get; set; } = null!;

        public string Name { get; set; } = null!;

        public string? Description { get; set; }

        public int Order { get; set; }

        public List<CriterionRequest> Criterions { get; set; } = new();
    }

    public class StandardRequestValidator : AbstractValidator<StandardRequest>
    {
        public StandardRequestValidator()
        {
            RuleFor(x => x.StandardSetId)
                .NotEmpty().WithMessage("Bộ tiêu chuẩn không được để trống");

            RuleFor(x => x.Code)
                .NotEmpty().WithMessage("Mã tiêu chuẩn không được để trống");

            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên tiêu chuẩn không được để trống");

            RuleFor(x => x.Order)
                .GreaterThanOrEqualTo(0).WithMessage("Thứ tự phải lớn hơn hoặc bằng 0");

            RuleForEach(x => x.Criterions).SetValidator(new CriterionRequestValidator());
        }
    }
}
