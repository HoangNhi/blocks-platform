using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Permission.Requests
{
    public class PermissionRequest
    {
        public Guid Id { get; set; }

        public Guid RoleId { get; set; }

        public Guid MenuId { get; set; }

        public bool IsViewed { get; set; } = false;

        public bool IsAdded { get; set; } = false;

        public bool IsUpdated { get; set; } = false;

        public bool IsDeleted { get; set; } = false;

        public bool IsApproved { get; set; } = false;

        public bool IsAnalyzed { get; set; } = false;
    }

    public class PermissionRequestValidator : AbstractValidator<PermissionRequest>
    {
        public PermissionRequestValidator()
        {
            RuleFor(r => r.RoleId).NotEmpty().WithMessage("Vai trò không được để trống");
            RuleFor(r => r.RoleId).NotEmpty().WithMessage("Menu không được để trống");
        }
    }
}
