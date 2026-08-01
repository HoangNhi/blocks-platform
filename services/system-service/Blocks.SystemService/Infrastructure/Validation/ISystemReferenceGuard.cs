namespace Blocks.SystemService.Infrastructure.Validation;

public interface ISystemReferenceGuard
{
    Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default);
    Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default);
    Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default);
    Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default);
}
