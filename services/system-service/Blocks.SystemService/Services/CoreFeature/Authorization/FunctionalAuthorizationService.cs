using Blocks.Shared.Authorization;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;
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

    public async Task<ScopedAuthorizationResult> CheckScopedAsync(
        Guid userId,
        string? permissionKey,
        FunctionalPermissionAction action,
        Guid? workspaceId,
        string? controller = null,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty || action is FunctionalPermissionAction.NONE)
        {
            return new ScopedAuthorizationResult(false);
        }

        var user = await _context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId && u.IsActived && !u.IsDeleted)
            .Select(u => new { u.Id, u.Username })
            .SingleOrDefaultAsync(cancellationToken);

        if (user is null)
        {
            return new ScopedAuthorizationResult(false);
        }

        var hasFunctionalPermission = await CheckAsync(userId, permissionKey, action, controller, cancellationToken);
        if (!hasFunctionalPermission)
        {
            return new ScopedAuthorizationResult(false, user.Id, user.Username, workspaceId);
        }

        if (workspaceId.HasValue && workspaceId.Value != Guid.Empty)
        {
            var isMember = await _context.WorkspaceMembers
                .AsNoTracking()
                .Where(wm => wm.UserId == userId
                    && wm.WorkspaceId == workspaceId.Value
                    && wm.IsActive
                    && !wm.IsDeleted)
                .Join(
                    _context.Workspaces.AsNoTracking().Where(w => w.IsActive && !w.IsDeleted),
                    wm => wm.WorkspaceId,
                    w => w.Id,
                    (wm, w) => wm.Id)
                .AnyAsync(cancellationToken);

            if (!isMember)
            {
                return new ScopedAuthorizationResult(false, user.Id, user.Username, workspaceId.Value);
            }

            return new ScopedAuthorizationResult(true, user.Id, user.Username, workspaceId.Value);
        }

        return new ScopedAuthorizationResult(true, user.Id, user.Username, null);
    }

    public Task<List<WorkspaceAccessDto>> GetUserWorkspacesAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return Task.FromResult(new List<WorkspaceAccessDto>());
        }

        return _context.WorkspaceMembers
            .AsNoTracking()
            .Where(wm => wm.UserId == userId && wm.IsActive && !wm.IsDeleted)
            .Join(
                _context.Workspaces.AsNoTracking().Where(w => w.IsActive && !w.IsDeleted),
                wm => wm.WorkspaceId,
                w => w.Id,
                (wm, w) => new WorkspaceAccessDto
                {
                    Id = w.Id,
                    Name = w.Name
                })
            .ToListAsync(cancellationToken);
    }
}
