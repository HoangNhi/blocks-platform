using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Services;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Xunit;

namespace Blocks.SystemService.Tests.Auth;

public sealed class RegistrationServiceTests
{
    [Fact]
    public async Task Open_registration_creates_user_personal_workspace_membership_and_audit()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.Open, role.Id);
        await context.SaveChangesAsync();
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterRequest
        {
            Username = "người-dùng",
            Email = "member@example.test",
            Fullname = "Nguyễn Văn A",
            Password = "mật-khẩu-dài-hơn-12",
        }, "127.0.0.1");

        Assert.Equal("người-dùng", result.Username);
        Assert.Equal(1, await context.Users.CountAsync());
        Assert.Equal(1, await context.Workspaces.CountAsync());
        Assert.Equal(1, await context.WorkspaceMembers.CountAsync());
        Assert.Equal(1, await context.AuditLogs.CountAsync(x => x.Action == "REGISTER"));
        var user = await context.Users.SingleAsync();
        Assert.Equal(role.Id, user.RoleId);
        Assert.NotEqual("mật-khẩu-dài-hơn-12", user.Password);
        Assert.NotEmpty(user.PasswordSalt);
    }

    [Fact]
    public async Task Open_registration_ignores_ungranted_admin_permission_rows()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
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
            workspaceMenu,
            adminMenu,
            new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = workspaceMenu.Id, IsViewed = true },
            new Permission { Id = Guid.NewGuid(), RoleId = role.Id, MenuId = adminMenu.Id });
        AddSetting(context, RegistrationModes.Open, role.Id);
        await context.SaveChangesAsync();
        var service = CreateService(context);

        var result = await service.RegisterAsync(Request(), "127.0.0.1");

        Assert.Equal(role.Id, (await context.Users.SingleAsync()).RoleId);
        Assert.Equal("member", result.Username);
    }

    [Fact]
    public async Task Admin_provisioned_mode_rejects_public_registration()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.AdminProvisioned, role.Id);
        await context.SaveChangesAsync();
        var service = CreateService(context);

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request(), "127.0.0.1"));

        Assert.Equal("Đăng ký tài khoản hiện không khả dụng", exception.Message);
        Assert.Empty(context.Users);
    }

    [Fact]
    public async Task Invite_only_registration_rejects_missing_expired_and_consumed_invitations()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.InviteOnly, role.Id);
        context.Invitations.AddRange(
            InvitationFor("expired-token", DateTime.UtcNow.AddMinutes(-1)),
            InvitationFor("consumed-token", DateTime.UtcNow.AddMinutes(1), DateTime.UtcNow));
        await context.SaveChangesAsync();
        var service = CreateService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request(), "127.0.0.1"));
        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request("expired-token"), "127.0.0.1"));
        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request("consumed-token"), "127.0.0.1"));
        Assert.Equal(0, await context.Users.CountAsync());
        Assert.NotEqual(Guid.Empty, role.Id);
    }

    [Fact]
    public async Task Invalid_default_role_blocks_registration_without_partial_user()
    {
        await using var context = CreateContext();
        AddSetting(context, RegistrationModes.Open, Guid.NewGuid());
        await context.SaveChangesAsync();
        var service = CreateService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request(), "127.0.0.1"));

        Assert.Empty(context.Users);
        Assert.Empty(context.Workspaces);
        Assert.Empty(context.WorkspaceMembers);
    }

    [Theory]
    [InlineData("Existing", "new@example.test")]
    [InlineData("new-user", "existing@example.test")]
    public async Task Duplicate_username_or_email_is_rejected(string username, string email)
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.Open, role.Id);
        context.Users.Add(new User
        {
            Id = Guid.NewGuid(), Username = "Existing", Email = "existing@example.test", Fullname = "Đã có",
            Password = "hash", PasswordSalt = "salt", RoleId = role.Id, CreatedAt = DateTime.UtcNow,
            CreatedBy = "test", IsActived = true, IsDeleted = false
        });
        await context.SaveChangesAsync();
        var service = CreateService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(new RegisterRequest
        {
            Username = username,
            Email = email,
            Fullname = "Người mới",
            Password = "mật-khẩu-dài-hơn-12"
        }, "127.0.0.1"));

        Assert.Equal(1, await context.Users.CountAsync());
    }

    [Fact]
    public async Task Ineligible_invitation_role_is_rejected()
    {
        await using var context = CreateContext();
        var defaultRole = AddRole(context, isRegistrationEligible: true);
        var invitationRole = AddRole(context, isRegistrationEligible: false);
        AddSetting(context, RegistrationModes.Open, defaultRole.Id);
        context.Invitations.Add(InvitationFor("role-token", DateTime.UtcNow.AddMinutes(5), registrationRoleId: invitationRole.Id));
        await context.SaveChangesAsync();
        var service = CreateService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request("role-token"), "127.0.0.1"));

        Assert.Empty(context.Users);
    }

    [Fact]
    public async Task Invitation_consumer_conditionally_consumes_once_and_rejects_second_consumer()
    {
        await using var context = CreateContext();
        var invitation = InvitationFor("single-use", DateTime.UtcNow.AddMinutes(5));
        context.Invitations.Add(invitation);
        await context.SaveChangesAsync();
        var consumer = new RegistrationInvitationConsumer();

        Assert.True(await consumer.TryConsumeAsync(context, invitation.Id, Guid.NewGuid(), "first"));
        Assert.False(await consumer.TryConsumeAsync(context, invitation.Id, Guid.NewGuid(), "second"));
        await context.SaveChangesAsync();

        var stored = await context.Invitations.SingleAsync();
        Assert.Equal("first", stored.UpdatedBy);
        Assert.NotNull(stored.ConsumedAt);
    }

    [Fact]
    public async Task Failed_invitation_consume_rolls_back_user_and_workspace_rows()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.Open, role.Id);
        var invitation = InvitationFor("rollback-token", DateTime.UtcNow.AddMinutes(5));
        context.Invitations.Add(invitation);
        await context.SaveChangesAsync();
        var service = CreateService(context, new RegistrationWorkspaceProvisioner(), new RegistrationAuditWriter(), new RejectingInvitationConsumer());

        await Assert.ThrowsAsync<BusinessException>(() => service.RegisterAsync(Request("rollback-token"), "127.0.0.1"));

        Assert.Empty(context.Users);
        Assert.Empty(context.Workspaces);
        Assert.Null((await context.Invitations.SingleAsync()).ConsumedAt);
    }

    [Fact]
    public async Task Workspace_failure_leaves_no_registration_rows()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.Open, role.Id);
        await context.SaveChangesAsync();
        var service = CreateService(context, new ThrowingWorkspaceProvisioner(), new RegistrationAuditWriter());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RegisterAsync(Request(), "127.0.0.1"));

        Assert.Empty(context.Users);
        Assert.Empty(context.Workspaces);
        Assert.Empty(context.WorkspaceMembers);
    }

    [Fact]
    public async Task Audit_failure_leaves_no_registration_rows()
    {
        await using var context = CreateContext();
        var role = AddRole(context, isRegistrationEligible: true);
        AddSetting(context, RegistrationModes.Open, role.Id);
        await context.SaveChangesAsync();
        var service = CreateService(context, new RegistrationWorkspaceProvisioner(), new ThrowingRegistrationAuditWriter());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RegisterAsync(Request(), "127.0.0.1"));

        Assert.Empty(context.Users);
        Assert.Empty(context.Workspaces);
        Assert.Empty(context.WorkspaceMembers);
        Assert.Empty(context.AuditLogs);
    }

    private static RegistrationService CreateService(
        SystemContext context,
        IRegistrationWorkspaceProvisioner? workspaceProvisioner = null,
        IRegistrationAuditWriter? auditWriter = null,
        IRegistrationInvitationConsumer? invitationConsumer = null)
    {
        return new RegistrationService(
            context,
            workspaceProvisioner ?? new RegistrationWorkspaceProvisioner(),
            auditWriter ?? new RegistrationAuditWriter(),
            invitationConsumer ?? new RegistrationInvitationConsumer());
    }

    private static RegisterRequest Request(string? invitationToken = null) => new()
    {
        Username = "member",
        Email = "member@example.test",
        Fullname = "Nguyễn Văn A",
        Password = "mật-khẩu-dài-hơn-12",
        InvitationToken = invitationToken
    };

    private static SystemContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(builder => builder.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new SystemContext(options);
    }

    private static Role AddRole(SystemContext context, bool isRegistrationEligible)
    {
        var role = new Role
        {
            Id = Guid.NewGuid(), Name = "User", Key = Guid.NewGuid().ToString("N"), IsRegistrationEligible = isRegistrationEligible,
            IsActived = true, IsDeleted = false, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        context.Roles.Add(role);
        return role;
    }

    private static InstanceSetting AddSetting(SystemContext context, string mode, Guid roleId)
    {
        var setting = new InstanceSetting
        {
            Id = Guid.NewGuid(), RegistrationMode = mode, DefaultRegistrationRoleId = roleId,
            CreatedAt = DateTime.UtcNow, CreatedBy = "test", IsActive = true, IsDeleted = false
        };
        context.InstanceSettings.Add(setting);
        return setting;
    }

    private static Invitation InvitationFor(string token, DateTime expiresAt, DateTime? consumedAt = null, Guid? registrationRoleId = null)
    {
        return new Invitation
        {
            Id = Guid.NewGuid(), TokenHash = RegistrationService.HashInvitationToken(token), ExpiresAt = expiresAt,
            ConsumedAt = consumedAt, RegistrationRoleId = registrationRoleId, CreatedAt = DateTime.UtcNow,
            CreatedBy = "test", IsActive = true, IsDeleted = false
        };
    }

    private sealed class ThrowingWorkspaceProvisioner : IRegistrationWorkspaceProvisioner
    {
        public Task<WorkspaceProvisioningResult> ProvisionAsync(SystemContext context, User user, string fullname, Invitation? invitation, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("workspace failure");
    }

    private sealed class RejectingInvitationConsumer : IRegistrationInvitationConsumer
    {
        public Task<bool> TryConsumeAsync(SystemContext context, Guid invitationId, Guid userId, string username, CancellationToken cancellationToken = default)
            => Task.FromResult(false);
    }

    private sealed class ThrowingRegistrationAuditWriter : IRegistrationAuditWriter
    {
        public Task WriteAsync(SystemContext context, AuditLog auditLog, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("audit failure");
    }
}
