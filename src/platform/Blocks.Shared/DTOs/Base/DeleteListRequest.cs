using FluentValidation;

namespace Blocks.Shared.DTOs.Base
{
    public class DeleteListRequest
    {
        public List<Guid> Ids { get; set; }
    }

    public class DeleteListRequestValidator : AbstractValidator<DeleteListRequest>
    {
        public DeleteListRequestValidator()
        {
            RuleFor(x => x.Ids)
                .NotEmpty().WithMessage("Danh sách dữ liệu không được để trống");
        }
    }
}
