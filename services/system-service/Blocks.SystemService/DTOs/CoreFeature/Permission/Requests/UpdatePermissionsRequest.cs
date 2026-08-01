using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Permission.Requests
{
    public class UpdatePermissionsRequest
    {
        public List<PermissionRequest> Permissions { get; set; } = new List<PermissionRequest>();
    }

    public class UpdatePermissionRequestValidator : AbstractValidator<UpdatePermissionsRequest>
    {
        public UpdatePermissionRequestValidator()
        {
            RuleFor(r => r.Permissions).NotEmpty().WithMessage("Danh sách phân quyền không được rỗng");
        }
    }
}
