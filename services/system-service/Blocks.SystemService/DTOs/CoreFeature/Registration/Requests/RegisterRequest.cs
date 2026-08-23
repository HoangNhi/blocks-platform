using System.Text.Json.Serialization;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class RegisterRequest
{
    [JsonRequired]
    public string Username { get; set; } = string.Empty;
    [JsonRequired]
    public string Email { get; set; } = string.Empty;
    [JsonRequired]
    public string Fullname { get; set; } = string.Empty;
    [JsonRequired]
    public string Password { get; set; } = string.Empty;
    public string? InvitationToken { get; set; }
}

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().WithMessage("Tên đăng nhập không được để trống");
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Email không hợp lệ");
        RuleFor(x => x.Fullname).NotEmpty().WithMessage("Họ tên không được để trống");
        RuleFor(x => x.Password).Must(password => password.Trim().Length > 0 && password.Length is >= 12 and <= 128)
            .WithMessage("Mật khẩu phải dài từ 12 đến 128 ký tự và không được chỉ chứa khoảng trắng");
    }
}
