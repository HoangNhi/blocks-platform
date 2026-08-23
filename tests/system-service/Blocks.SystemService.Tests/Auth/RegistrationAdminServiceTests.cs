using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.SystemService.Tests.Auth;

public sealed class RegistrationAdminServiceTests
{
    [Fact]
    public async Task Settings_reject_administrator_role_even_when_registration_eligible()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "administrator", isSystem: true, isRegistrationEligible: true);
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.UpdateSettingsAsync(new RegistrationSettingsRequest
        {
            RegistrationMode = RegistrationModes.Open,
            DefaultRegistrationRoleId = role.Id
        }, "admin"));
    }

    [Theory]
    [InlineData("administrator")]
    [InlineData("operator")]
    [InlineData("admin.registration")]
    public async Task Settings_reject_privileged_registration_role(string key)
    {
        await using var context = CreateContext();
        var role = AddRole(context, key, isSystem: false, isRegistrationEligible: true);
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.UpdateSettingsAsync(new RegistrationSettingsRequest
        {
            RegistrationMode = RegistrationModes.Open,
            DefaultRegistrationRoleId = role.Id
        }, "admin"));
    }

    [Fact]
    public async Task Invitations_reject_role_with_admin_permission()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "reviewer", isSystem: false, isRegistrationEligible: true);
        var menu = new Menu
        {
            Id = Guid.NewGuid(), Controller = "RegistrationAdmin", Name = "Registration", PermissionKey = "admin.registration",
            SystemGroupId = Guid.NewGuid(), CanView = true, IsActived = true, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        context.AddRange(role, menu, new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = menu.Id, IsViewed = true });
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.CreateInvitationAsync(new InvitationCreateRequest
        {
            ExpiresAt = DateTime.UtcNow.AddMinutes(5), RegistrationRoleId = role.Id
        }, "admin"));
    }

    [Fact]
    public async Task Settings_reject_domain_permission_without_resource_safety_gate()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "member", isSystem: true, isRegistrationEligible: true);
        var menu = new Menu
        {
            Id = Guid.NewGuid(),
            Controller = "TradeLab",
            Name = "Strategies",
            PermissionKey = "tradelab.strategies",
            SystemGroupId = Guid.NewGuid(),
            CanView = true,
            IsActived = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        context.AddRange(role, menu, new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = menu.Id, IsViewed = true });
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.UpdateSettingsAsync(new RegistrationSettingsRequest
        {
            RegistrationMode = RegistrationModes.Open,
            DefaultRegistrationRoleId = role.Id
        }, "admin"));
    }

    [Fact]
    public async Task Settings_allow_member_role_with_ungranted_admin_permission_rows()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "member", isSystem: true, isRegistrationEligible: true);
        var workspaceMenu = new Menu
        {
            Id = Guid.NewGuid(), Controller = "Workspace", Name = "Workspace", PermissionKey = "workspace.home",
            SystemGroupId = Guid.NewGuid(), CanView = true, IsActived = true, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        var adminMenu = new Menu
        {
            Id = Guid.NewGuid(), Controller = "User", Name = "Users", PermissionKey = "admin.users",
            SystemGroupId = Guid.NewGuid(), CanView = true, IsActived = true, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        context.AddRange(
            role,
            workspaceMenu,
            adminMenu,
            new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = workspaceMenu.Id, IsViewed = true },
            new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = adminMenu.Id });
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        var result = await service.UpdateSettingsAsync(new RegistrationSettingsRequest
        {
            RegistrationMode = RegistrationModes.Open,
            DefaultRegistrationRoleId = role.Id
        }, "admin");

        Assert.Equal(RegistrationModes.Open, result.RegistrationMode);
        Assert.Equal(role.Id, result.DefaultRegistrationRoleId);
    }

    [Fact]
    public async Task Invitations_reject_missing_or_inactive_target_workspace()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "member", isSystem: true, isRegistrationEligible: true);
        var inactiveWorkspace = new Workspace
        {
            Id = Guid.NewGuid(), Name = "Closed", CreatedAt = DateTime.UtcNow, CreatedBy = "test", IsActive = false
        };
        context.AddRange(role, inactiveWorkspace);
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.CreateInvitationAsync(new InvitationCreateRequest
        {
            ExpiresAt = DateTime.UtcNow.AddMinutes(5), TargetWorkspaceId = Guid.NewGuid(), RegistrationRoleId = role.Id
        }, "admin"));
        await Assert.ThrowsAsync<BusinessException>(() => service.CreateInvitationAsync(new InvitationCreateRequest
        {
            ExpiresAt = DateTime.UtcNow.AddMinutes(5), TargetWorkspaceId = inactiveWorkspace.Id, RegistrationRoleId = role.Id
        }, "admin"));
    }

    [Fact]
    public async Task Valid_invitation_returns_plaintext_once_and_stores_sha256_hash()
    {
        await using var context = CreateContext();
        var role = AddRole(context, "creator", isSystem: false, isRegistrationEligible: true);
        var workspace = new Workspace
        {
            Id = Guid.NewGuid(), Name = "Community", CreatedAt = DateTime.UtcNow, CreatedBy = "test", IsActive = true, IsDeleted = false
        };
        context.AddRange(role, workspace);
        await context.SaveChangesAsync();
        var service = new RegistrationAdminService(context);

        var result = await service.CreateInvitationAsync(new InvitationCreateRequest
        {
            ExpiresAt = DateTime.UtcNow.AddMinutes(5), TargetWorkspaceId = workspace.Id, RegistrationRoleId = role.Id
        }, "admin");
        var stored = await context.Invitations.SingleAsync();

        Assert.NotEmpty(result.Token);
        Assert.Equal(RegistrationService.HashInvitationToken(result.Token), stored.TokenHash);
        Assert.NotEqual(result.Token, stored.TokenHash);
    }

    private static SystemContext CreateContext()
    {
        return new SystemContext(new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static Role AddRole(SystemContext context, string key, bool isSystem, bool isRegistrationEligible)
    {
        var role = new Role
        {
            Id = Guid.NewGuid(), Name = key, Key = key, IsSystem = isSystem, IsRegistrationEligible = isRegistrationEligible,
            IsActived = true, IsDeleted = false, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        context.Roles.Add(role);
        return role;
    }
}
