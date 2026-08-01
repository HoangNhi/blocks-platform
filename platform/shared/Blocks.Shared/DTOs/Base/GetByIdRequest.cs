using FluentValidation;

namespace Blocks.Shared.DTOs.Base
{
    public class GetByIdRequest
    {
        public Guid? Id { get; set; }
    }

    public class GetByIdDeleteRequestValidator : AbstractValidator<GetByIdRequest>
    {
        public GetByIdDeleteRequestValidator()
        {
            RuleFor(r => r.Id).NotNull().WithMessage("Dữ liệu không được để trống");
        }
    }
}
