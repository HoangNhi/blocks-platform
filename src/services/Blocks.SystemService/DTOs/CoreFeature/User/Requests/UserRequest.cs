using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Requests
{
    public class UserRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public string Username { get; set; } = null!;

        public string Fullname { get; set; } = null!;

        public string Password { get; set; } = null!;

        public Guid RoleId { get; set; }

        public string Email { get; set; } = null!;

        public string? Avatar { get; set; }

        public string AvatarAction { get; set; } = "keep";
    }

    public class UserRequestValidator : AbstractValidator<UserRequest>
    {
        private static readonly string[] ValidActions = ["keep", "replace", "remove"];

        public UserRequestValidator()
        {
            RuleFor(x => x.Username)
                .NotEmpty().WithMessage("Tên tài khoản không được để trống");
            RuleFor(x => x.Fullname)
                .NotEmpty().WithMessage("Họ và tên không được để trống");
            RuleFor(x => x.Password)
                .NotEmpty().WithMessage("Mật khẩu không được để trống");
            RuleFor(x => x.RoleId)
                .NotEmpty().WithMessage("Vai trò không được để trống");
            RuleFor(x => x.Email)
                .NotEmpty().WithMessage("Email không được để trống")
                .EmailAddress().WithMessage("Email không hợp lệ");

            RuleFor(x => x.AvatarAction)
                .Must(a => !string.IsNullOrWhiteSpace(a) && ValidActions.Contains(a.Trim().ToLowerInvariant()))
                .WithMessage("Hành động ảnh đại diện không hợp lệ (chỉ chấp nhận keep, replace, remove).");

            RuleFor(x => x.FolderUpload)
                .Must(f => Guid.TryParseExact(f, "D", out var g) && g != Guid.Empty)
                .When(x => string.Equals(x.AvatarAction?.Trim(), "replace", StringComparison.OrdinalIgnoreCase))
                .WithMessage("Thư mục tải lên không hợp lệ khi thay thế ảnh đại diện.");
        }
    }
}
