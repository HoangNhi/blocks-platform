using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Menu.Requests
{
    public class MenuRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public string Controller { get; set; } = null!;

        public string Name { get; set; } = null!;

        public Guid SystemGroupId { get; set; }

        public new int Sort { get; set; }

        public bool CanView { get; set; }

        public bool CanAdd { get; set; }

        public bool CanUpdate { get; set; }

        public bool CanDelete { get; set; }

        public bool CanApprove { get; set; }

        public bool CanAnalyze { get; set; }

        public bool IsShowMenu { get; set; } = true;
    }

    public class MenuRequestValidator : AbstractValidator<MenuRequest>
    {
        public MenuRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên menu không được để trống");
            RuleFor(x => x.Controller)
                .NotEmpty().WithMessage("Controller không được để trống");
            RuleFor(x => x.SystemGroupId)
                .NotEmpty().WithMessage("Nhóm hệ thống không được để trống");
        }
    }
}
