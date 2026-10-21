using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests
{
    public class GetListStandardWithCriteriaRequest
    {
        public Guid? StandardSetId { get; set; }
        public Guid? FileTypeId { get; set; }
    }

    public class GetListStandardWithCriteriaRequestValidator : AbstractValidator<GetListStandardWithCriteriaRequest>
    {
        public GetListStandardWithCriteriaRequestValidator()
        {
            RuleFor(x => x.StandardSetId)
                .NotEmpty()
                .WithMessage("Bộ tiêu chuẩn không được để trống");
        }
    }
}
