using Blocks.Shared.Authorization;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Authorization.Requests;

public sealed class FunctionalPermissionCheckRequest
{
    public string PermissionKey { get; set; } = string.Empty;
    public FunctionalPermissionAction Action { get; set; }
}

public sealed class FunctionalPermissionCheckRequestValidator : AbstractValidator<FunctionalPermissionCheckRequest>
{
    public FunctionalPermissionCheckRequestValidator()
    {
        RuleFor(request => request.PermissionKey).NotEmpty();
        RuleFor(request => request.Action)
            .IsInEnum()
            .Must(action => action != FunctionalPermissionAction.NONE)
            .WithMessage("Hành động không được hỗ trợ");
    }
}
