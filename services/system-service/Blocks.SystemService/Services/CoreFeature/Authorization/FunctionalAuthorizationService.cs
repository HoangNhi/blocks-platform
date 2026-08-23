using Blocks.Shared.Authorization;
using Blocks.SystemService.Infrastructure.Data;
using AutoDependencyRegistration.Attributes;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.CoreFeature.Authorization;

[RegisterClassAsTransient]
public sealed class FunctionalAuthorizationService : IFunctionalAuthorizationService
{
    private readonly SystemContext _context;

    public FunctionalAuthorizationService(SystemContext context)
    {
        _context = context;
    }

    public Task<bool> CheckAsync(
        Guid userId,
        string? permissionKey,
        FunctionalPermissionAction action,
        string? controller = null,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty || action is FunctionalPermissionAction.NONE)
        {
            return Task.FromResult(false);
        }

        var query = _context.Users
            .AsNoTracking()
            .Where(user => user.Id == userId && user.IsActived && !user.IsDeleted)
            .Join(
                _context.Roles.AsNoTracking().Where(role => role.IsActived && !role.IsDeleted),
                user => user.RoleId,
                role => role.Id,
                (user, role) => new { user, role })
            .Join(
                _context.Permissions.AsNoTracking(),
                item => item.role.Id,
                permission => permission.RoleId,
                (item, permission) => new { item.user, item.role, permission })
            .Join(
                _context.Menus.AsNoTracking().Where(menu => menu.IsActived && !menu.IsDeleted),
                item => item.permission.MenuId,
                menu => menu.Id,
                (item, menu) => new { item.user, item.role, item.permission, menu })
            .Where(item => !string.IsNullOrWhiteSpace(permissionKey)
                ? item.menu.PermissionKey == permissionKey
                : !string.IsNullOrWhiteSpace(controller)
                    && item.menu.Controller.ToLower() == controller.ToLower());

        query = action switch
        {
            FunctionalPermissionAction.VIEW => query.Where(item => item.menu.CanView && item.permission.IsViewed),
            FunctionalPermissionAction.ADD => query.Where(item => item.menu.CanAdd && item.permission.IsAdded),
            FunctionalPermissionAction.UPDATE => query.Where(item => item.menu.CanUpdate && item.permission.IsUpdated),
            FunctionalPermissionAction.DELETE => query.Where(item => item.menu.CanDelete && item.permission.IsDeleted),
            FunctionalPermissionAction.APPROVE => query.Where(item => item.menu.CanApprove && item.permission.IsApproved),
            FunctionalPermissionAction.ANALYZE => query.Where(item => item.menu.CanAnalyze && item.permission.IsAnalyzed),
            _ => query.Where(_ => false)
        };

        return query.AnyAsync(cancellationToken);
    }
}
