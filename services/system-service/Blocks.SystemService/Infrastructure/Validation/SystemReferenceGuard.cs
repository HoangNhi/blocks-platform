using Blocks.Shared.Exceptions;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Infrastructure.Validation;

public class SystemReferenceGuard : ISystemReferenceGuard
{
    private readonly IDbContextFactory<SystemContext> _contextFactory;

    public SystemReferenceGuard(IDbContextFactory<SystemContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    public async Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default)
    {
        await using var context = _contextFactory.CreateDbContext();

        var exists = await context.Roles.AsNoTracking()
            .AnyAsync(x => x.Id == roleId && !x.IsDeleted, cancellationToken);

        if (!exists)
            throw new BusinessException("Vai trò không tồn tại.");
    }

    public async Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default)
    {
        await using var context = _contextFactory.CreateDbContext();

        var exists = await context.Menus.AsNoTracking()
            .AnyAsync(x => x.Id == menuId && !x.IsDeleted, cancellationToken);

        if (!exists)
            throw new BusinessException("Menu không tồn tại.");
    }

    public async Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default)
    {
        await using var context = _contextFactory.CreateDbContext();

        var exists = await context.SystemGroups.AsNoTracking()
            .AnyAsync(x => x.Id == systemGroupId && !x.IsDeleted, cancellationToken);

        if (!exists)
            throw new BusinessException(errorMessage);
    }

    public async Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
            return null;

        await using var context = _contextFactory.CreateDbContext();

        var exists = await context.Users.AsNoTracking()
            .AnyAsync(x => x.Id == userId && !x.IsDeleted, cancellationToken);

        return exists ? userId : null;
    }

    public async Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(username))
            return null;

        await using var context = _contextFactory.CreateDbContext();

        return await context.Users.AsNoTracking()
            .Where(x => x.Username == username && !x.IsDeleted)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
