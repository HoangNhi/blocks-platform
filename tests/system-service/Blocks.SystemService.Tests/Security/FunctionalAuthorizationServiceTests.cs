using Blocks.Shared.Authorization;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public sealed class FunctionalAuthorizationServiceTests
{
    [Fact]
    public async Task CheckAsync_allows_granted_supported_action_for_active_identity()
    {
        var (context, user, menu) = CreateContext();
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.True(await service.CheckAsync(user.Id, menu.PermissionKey, FunctionalPermissionAction.VIEW));
    }

    [Fact]
    public async Task CheckAsync_denies_missing_grant()
    {
        var (context, user, menu) = CreateContext();
        var service = new FunctionalAuthorizationService(context);

        Assert.False(await service.CheckAsync(user.Id, menu.PermissionKey, FunctionalPermissionAction.VIEW));
    }

    [Fact]
    public async Task CheckAsync_denies_unsupported_menu_action_even_when_role_grants_it()
    {
        var (context, user, menu) = CreateContext();
        menu.CanAdd = false;
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsAdded = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.False(await service.CheckAsync(user.Id, menu.PermissionKey, FunctionalPermissionAction.ADD));
    }

    [Theory]
    [InlineData(true, false, false, false, false, false)]
    [InlineData(false, true, false, false, false, false)]
    [InlineData(false, false, true, false, false, false)]
    [InlineData(false, false, false, true, false, false)]
    [InlineData(false, false, false, false, true, false)]
    [InlineData(false, false, false, false, false, true)]
    public async Task CheckAsync_denies_inactive_or_deleted_user_role_or_menu(
        bool inactiveUser,
        bool deletedUser,
        bool inactiveRole,
        bool deletedRole,
        bool inactiveMenu,
        bool deletedMenu)
    {
        var (context, user, menu) = CreateContext();
        user.IsActived = !inactiveUser;
        user.IsDeleted = deletedUser;
        var role = await context.Roles.SingleAsync(x => x.Id == user.RoleId);
        role.IsActived = !inactiveRole;
        role.IsDeleted = deletedRole;
        menu.IsActived = !inactiveMenu;
        menu.IsDeleted = deletedMenu;
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.False(await service.CheckAsync(user.Id, menu.PermissionKey, FunctionalPermissionAction.VIEW));
    }

    [Fact]
    public async Task CheckAsync_denies_missing_permission_key()
    {
        var (context, user, menu) = CreateContext();
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.False(await service.CheckAsync(user.Id, "missing.permission", FunctionalPermissionAction.VIEW));
    }

    [Fact]
    public async Task CheckAsync_uses_any_grant_when_duplicate_rows_exist()
    {
        var (context, user, menu) = CreateContext();
        context.Permissions.AddRange(
            new Permission { Id = Guid.NewGuid(), RoleId = user.RoleId, MenuId = menu.Id },
            new Permission { Id = Guid.NewGuid(), RoleId = user.RoleId, MenuId = menu.Id, IsViewed = true });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.True(await service.CheckAsync(user.Id, menu.PermissionKey, FunctionalPermissionAction.VIEW));
    }

    [Fact]
    public async Task CheckAsync_falls_back_to_controller_when_permission_key_is_missing()
    {
        var (context, user, menu) = CreateContext();
        context.Permissions.Add(new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = user.RoleId,
            MenuId = menu.Id,
            IsViewed = true
        });
        await context.SaveChangesAsync();

        var service = new FunctionalAuthorizationService(context);

        Assert.True(await service.CheckAsync(user.Id, null, FunctionalPermissionAction.VIEW, menu.Controller));
    }

    private static (SystemContext Context, User User, Menu Menu) CreateContext()
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
            Username = "member",
            Fullname = "Member",
            Email = "member@example.test",
            Password = "hash",
            PasswordSalt = "salt",
            CreatedBy = "test",
            RoleId = role.Id,
            IsActived = true
        };
        var menu = new Menu
        {
            Id = Guid.NewGuid(),
            Controller = "User",
            Name = "Users",
            PermissionKey = "admin.users",
            CreatedBy = "test",
            CanView = true,
            CanAdd = true,
            IsActived = true
        };
        context.AddRange(role, user, menu);
        context.SaveChanges();
        return (context, user, menu);
    }
}
