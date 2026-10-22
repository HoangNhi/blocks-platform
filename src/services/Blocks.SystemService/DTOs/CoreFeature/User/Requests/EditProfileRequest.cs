using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Requests
{
    public class EditProfileRequest : BaseRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? Avatar { get; set; }
        public string AvatarAction { get; set; } = "keep";
    }

    public class EditProfileRequestValidator : AbstractValidator<EditProfileRequest>
    {
        private static readonly string[] ValidActions = ["keep", "replace", "remove"];

        public EditProfileRequestValidator()
        {
            RuleFor(x => x.FullName)
                .NotEmpty().WithMessage("Họ và tên không được để trống.");

            RuleFor(x => x.Email)
                .NotEmpty().WithMessage("Email không được để trống.")
                .EmailAddress().WithMessage("Email không đúng định dạng.");

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
