using Blocks.Shared.Authorization;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;

namespace Blocks.SystemService.Services.CoreFeature.Authorization;

public sealed record ScopedAuthorizationResult(
    bool HasPermission,
    Guid? UserId = null,
    string? Username = null,
    Guid? WorkspaceId = null
);

public interface IFunctionalAuthorizationService
{
    Task<bool> CheckAsync(
        Guid userId,
        string? permissionKey,
        FunctionalPermissionAction action,
        string? controller = null,
        CancellationToken cancellationToken = default);

    async Task<ScopedAuthorizationResult> CheckScopedAsync(
        Guid userId,
        string? permissionKey,
        FunctionalPermissionAction action,
        Guid? workspaceId,
        string? controller = null,
        CancellationToken cancellationToken = default)
    {
        var hasPermission = await CheckAsync(userId, permissionKey, action, controller, cancellationToken);
        return new ScopedAuthorizationResult(hasPermission, userId, null, workspaceId);
    }

    Task<List<WorkspaceAccessDto>> GetUserWorkspacesAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new List<WorkspaceAccessDto>());
    }
}
