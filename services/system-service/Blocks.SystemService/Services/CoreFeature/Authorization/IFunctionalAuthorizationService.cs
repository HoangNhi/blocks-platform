using Blocks.Shared.Authorization;

namespace Blocks.SystemService.Services.CoreFeature.Authorization;

public interface IFunctionalAuthorizationService
{
    Task<bool> CheckAsync(
        Guid userId,
        string? permissionKey,
        FunctionalPermissionAction action,
        string? controller = null,
        CancellationToken cancellationToken = default);
}
