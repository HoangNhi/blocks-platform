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
    }

    public class EditProfileRequestValidator : AbstractValidator<EditProfileRequest>
    {
        public EditProfileRequestValidator()
        {
            RuleFor(x => x.FullName)
                .NotEmpty().WithMessage("Họ và tên không được để trống.");

            RuleFor(x => x.Email)
                .NotEmpty().WithMessage("Email không được để trống.")
                .EmailAddress().WithMessage("Email không đúng định dạng.");
        }
    }
}
