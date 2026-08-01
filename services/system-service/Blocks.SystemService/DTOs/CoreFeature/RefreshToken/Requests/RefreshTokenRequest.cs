using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests
{
    public class RefreshTokenRequest
    {
        public string RefreshToken { get; set; } = null!;
    }

    public class RefreshTokenRequestValidator : AbstractValidator<RefreshTokenRequest>
    {
        public RefreshTokenRequestValidator()
        {
            RuleFor(x => x.RefreshToken).NotEmpty().WithMessage("Token không được để trống");
        }
    }
}
