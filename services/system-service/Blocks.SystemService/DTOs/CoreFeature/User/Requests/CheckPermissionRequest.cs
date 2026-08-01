using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Requests
{
    public class CheckPermissionRequest
    {
        public Guid UserId { get; set; }
        public string Controller { get; set; } = null!;
        public int Action { get; set; }
    }

    public class GetListPermissionRequestValidator : AbstractValidator<CheckPermissionRequest>
    {
        public GetListPermissionRequestValidator()
        {
            RuleFor(r => r.UserId).NotEmpty().WithMessage("Người dùng không được để trống");
            RuleFor(r => r.Controller).NotEmpty().WithMessage("Đường dẫn không được để trống");
            RuleFor(r => r.Action).NotEmpty().WithMessage("Hành động không được để trống");
        }
    }
}
