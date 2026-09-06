using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Role.Requests;

public sealed class RoleSaveRequest
{
    public Guid Id { get; set; }

    public RoleSaveDetailsRequest? Details { get; set; }

    public List<PermissionRequest>? Permissions { get; set; }
}

public sealed class RoleSaveDetailsRequest
{
    public string Name { get; set; } = null!;

    public string Key { get; set; } = null!;

    public bool IsRegistrationEligible { get; set; }

    public bool IsActived { get; set; } = true;
}

public sealed class RoleSaveRequestValidator : AbstractValidator<RoleSaveRequest>
{
    public RoleSaveRequestValidator()
    {
        RuleFor(request => request.Id).NotEmpty();
        RuleFor(request => request)
            .Must(request => request.Details is not null || request.Permissions is { Count: > 0 })
            .WithMessage("Phai co thay doi vai tro hoac phan quyen");
        When(request => request.Details is not null, () =>
        {
            RuleFor(request => request.Details!.Name).NotEmpty();
            RuleFor(request => request.Details!.Key).NotEmpty();
        });
    }
}
