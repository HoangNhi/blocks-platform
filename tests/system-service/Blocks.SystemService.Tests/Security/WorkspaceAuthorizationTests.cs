using Blocks.Shared.Authorization;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public sealed class WorkspaceAuthorizationTests
{
    [Fact]
    public async Task CheckScopedAsync_allows_active_user_role_member_and_workspace()
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        var result = await service.CheckScopedAsync(
            user.Id,
            menu.PermissionKey,
            FunctionalPermissionAction.VIEW,
            workspace.Id);

        Assert.True(result.HasPermission);
        Assert.Equal(user.Id, result.UserId);
        Assert.Equal(user.Username, result.Username);
        Assert.Equal(workspace.Id, result.WorkspaceId);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task CheckScopedAsync_denies_inactive_or_deleted_workspace(bool inactive, bool deleted)
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        workspace.IsActive = !inactive;
        workspace.IsDeleted = deleted;
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        var result = await service.CheckScopedAsync(
            user.Id,
            menu.PermissionKey,
            FunctionalPermissionAction.VIEW,
            workspace.Id);

        Assert.False(result.HasPermission);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task CheckScopedAsync_denies_inactive_or_deleted_member(bool inactive, bool deleted)
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        member.IsActive = !inactive;
        member.IsDeleted = deleted;
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        var result = await service.CheckScopedAsync(
            user.Id,
            menu.PermissionKey,
            FunctionalPermissionAction.VIEW,
            workspace.Id);

        Assert.False(result.HasPermission);
    }

    [Fact]
    public async Task CheckScopedAsync_denies_when_user_is_not_member_of_workspace()
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        var otherWorkspace = new Workspace
        {
            Id = Guid.NewGuid(),
            Name = "Other Workspace",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };
        context.Workspaces.Add(otherWorkspace);
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        var result = await service.CheckScopedAsync(
            user.Id,
            menu.PermissionKey,
            FunctionalPermissionAction.VIEW,
            otherWorkspace.Id);

        Assert.False(result.HasPermission);
    }

    [Fact]
    public async Task CheckScopedAsync_without_workspace_preserves_functional_behavior()
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        var result = await service.CheckScopedAsync(
            user.Id,
            menu.PermissionKey,
            FunctionalPermissionAction.VIEW,
            null);

        Assert.True(result.HasPermission);
        Assert.Equal(user.Id, result.UserId);
        Assert.Equal(user.Username, result.Username);
        Assert.Null(result.WorkspaceId);
    }

    [Fact]
    public async Task GetUserWorkspacesAsync_returns_active_workspaces_for_user()
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        var workspace2 = new Workspace
        {
            Id = Guid.NewGuid(),
            Name = "Workspace 2",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };
        var member2 = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspace2.Id,
            UserId = user.Id,
            Role = "member",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };
        context.AddRange(workspace2, member2);
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);
        var workspaces = await service.GetUserWorkspacesAsync(user.Id);

        Assert.Equal(2, workspaces.Count);
        Assert.Contains(workspaces, w => w.Id == workspace.Id && w.Name == workspace.Name);
        Assert.Contains(workspaces, w => w.Id == workspace2.Id && w.Name == workspace2.Name);
    }

    [Fact]
    public async Task GetUserWorkspacesAsync_excludes_inactive_or_deleted()
    {
        var (context, user, menu, workspace, member) = CreateContextWithWorkspace();
        var inactiveWs = new Workspace
        {
            Id = Guid.NewGuid(),
            Name = "Inactive WS",
            CreatedBy = "test",
            IsActive = false,
            IsDeleted = false
        };
        var memberInactive = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            WorkspaceId = inactiveWs.Id,
            UserId = user.Id,
            Role = "member",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };
        context.AddRange(inactiveWs, memberInactive);
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);
        var workspaces = await service.GetUserWorkspacesAsync(user.Id);

        Assert.Single(workspaces);
        Assert.Equal(workspace.Id, workspaces[0].Id);
    }

    private static (SystemContext Context, User User, Menu Menu, Workspace Workspace, WorkspaceMember Member) CreateContextWithWorkspace()
    {
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new SystemContext(options);
        var role = new Role
        {
            Id = Guid.NewGuid(),
            Name = "Member",
            Key = "member",
            CreatedBy = "test",
            IsActived = true
        };
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "trader_alice",
            Fullname = "Trader Alice",
            Email = "alice@example.test",
            Password = "hash",
            PasswordSalt = "salt",
            CreatedBy = "test",
            RoleId = role.Id,
            IsActived = true
        };
        var menu = new Menu
        {
            Id = Guid.NewGuid(),
            Controller = "TradeLab",
            Name = "TradeLab Strategies",
            PermissionKey = "tradelab.strategies",
            CreatedBy = "test",
            CanView = true,
            CanAdd = true,
            IsActived = true
        };
        var workspace = new Workspace
        {
            Id = Guid.NewGuid(),
            Name = "Alice Workspace",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspace.Id,
            UserId = user.Id,
            Role = "owner",
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        };

        context.AddRange(role, user, menu, workspace, member);
        context.SaveChanges();
        return (context, user, menu, workspace, member);
    }
}
