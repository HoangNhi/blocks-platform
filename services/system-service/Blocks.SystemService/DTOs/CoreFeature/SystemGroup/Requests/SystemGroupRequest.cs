using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Requests
{
    public class SystemGroupRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = null!;

        public new int Sort { get; set; }

        public Guid? Parentid { get; set; }
    }

    public class SystemGroupRequestValidator : AbstractValidator<SystemGroupRequest>
    {
        public SystemGroupRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên nhóm không được để trống");
        }
    }
}
