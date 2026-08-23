using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Role.Requests
{
    public class RoleRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = null!;

        public string Key { get; set; } = null!;

        public bool IsRegistrationEligible { get; set; }
    }

    public class RoleRequestValidator : AbstractValidator<RoleRequest>
    {
        public RoleRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên gọi không được để trống");
            RuleFor(x => x.Key)
                .NotEmpty().WithMessage("Mã vai trò không được để trống");
        }
    }
}
