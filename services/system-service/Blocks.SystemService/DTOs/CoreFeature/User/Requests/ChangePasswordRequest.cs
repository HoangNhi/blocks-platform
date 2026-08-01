using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Requests
{
    public class ChangePasswordRequest
    {
        public string? OldPassword { get; set; } = string.Empty;
        public string? NewPassword { get; set; } = string.Empty;
        public string? ConfirmNewPassword { get; set; } = string.Empty;
    }

    public class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
    {
        public ChangePasswordRequestValidator()
        {
            RuleFor(x => x.OldPassword)
                .NotEmpty().WithMessage("Mật khẩu cũ không được để trống.");

            RuleFor(x => x.NewPassword)
                .NotEmpty().WithMessage("Mật khẩu mới không được để trống.");

            RuleFor(x => x.ConfirmNewPassword)
                .NotEmpty().WithMessage("Xác nhận mật khẩu mới không được để trống.")
                .Equal(x => x.NewPassword).WithMessage("Xác nhận mật khẩu mới không khớp với mật khẩu mới.");
        }
    }
}
