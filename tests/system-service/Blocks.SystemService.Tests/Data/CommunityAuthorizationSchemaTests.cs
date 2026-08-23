using System.Reflection;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.SystemService.Tests.Data;

public sealed class CommunityAuthorizationSchemaTests
{
    [Fact]
    public void Community_entities_expose_required_audit_and_relationship_fields()
    {
        AssertRequiredProperties<InstanceSetting>(
            nameof(InstanceSetting.CreatedAt),
            nameof(InstanceSetting.CreatedBy),
            nameof(InstanceSetting.UpdatedAt),
            nameof(InstanceSetting.UpdatedBy),
            nameof(InstanceSetting.IsActive),
            nameof(InstanceSetting.IsDeleted));
        AssertRequiredProperties<Workspace>(
            nameof(Workspace.CreatedAt),
            nameof(Workspace.CreatedBy),
            nameof(Workspace.UpdatedAt),
            nameof(Workspace.UpdatedBy),
            nameof(Workspace.IsActive),
            nameof(Workspace.IsDeleted));
        AssertRequiredProperties<WorkspaceMember>(
            nameof(WorkspaceMember.CreatedAt),
            nameof(WorkspaceMember.CreatedBy),
            nameof(WorkspaceMember.UpdatedAt),
            nameof(WorkspaceMember.UpdatedBy),
            nameof(WorkspaceMember.IsActive),
            nameof(WorkspaceMember.IsDeleted));
        AssertRequiredProperties<Invitation>(
            nameof(Invitation.CreatedAt),
            nameof(Invitation.CreatedBy),
            nameof(Invitation.UpdatedAt),
            nameof(Invitation.UpdatedBy),
            nameof(Invitation.IsActive),
            nameof(Invitation.IsDeleted),
            nameof(Invitation.ExpiresAt),
            nameof(Invitation.ConsumedAt),
            nameof(Invitation.ConsumedBy),
            nameof(Invitation.TargetWorkspaceId),
            nameof(Invitation.RegistrationRoleId),
            nameof(Invitation.TokenHash));
    }

    [Fact]
    public void System_model_maps_stable_keys_and_community_constraints()
    {
        using var context = new SystemContext(new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(nameof(System_model_maps_stable_keys_and_community_constraints))
            .Options);
        var model = context.Model;

        AssertRequiredProperties<Role>(
            nameof(Role.Key),
            nameof(Role.IsSystem),
            nameof(Role.IsRegistrationEligible));
        AssertRequiredProperties<Menu>(nameof(Menu.PermissionKey));
        Assert.Equal("key", model.FindEntityType(typeof(Role))!.FindProperty(nameof(Role.Key))!.GetColumnName());
        Assert.Equal("permission_key", model.FindEntityType(typeof(Menu))!.FindProperty(nameof(Menu.PermissionKey))!.GetColumnName());
        Assert.Equal("instance_setting", model.FindEntityType(typeof(InstanceSetting))!.GetTableName());
        Assert.Equal("workspace", model.FindEntityType(typeof(Workspace))!.GetTableName());
        Assert.Equal("workspace_member", model.FindEntityType(typeof(WorkspaceMember))!.GetTableName());
        Assert.Equal("invitation", model.FindEntityType(typeof(Invitation))!.GetTableName());

        var role = model.FindEntityType(typeof(Role))!;
        Assert.Contains(role.GetIndexes(), index => index.IsUnique && index.Properties.Any(property => property.Name == nameof(Role.Key)));

        var menu = model.FindEntityType(typeof(Menu))!;
        Assert.Contains(menu.GetIndexes(), index => index.IsUnique && index.Properties.Any(property => property.Name == nameof(Menu.PermissionKey)));

        var permission = model.FindEntityType(typeof(Permission))!;
        Assert.Contains(permission.GetIndexes(), index =>
            index.IsUnique &&
            index.Properties.Select(property => property.Name).SequenceEqual([
                nameof(Permission.RoleId),
                nameof(Permission.MenuId)]));

        var user = model.FindEntityType(typeof(User))!;
        var instanceSetting = model.FindEntityType(typeof(InstanceSetting))!;
        Assert.Contains(instanceSetting.GetIndexes(), index =>
            index.IsUnique &&
            index.GetFilter() == "is_active AND NOT is_deleted" &&
            index.Properties.Any(property => property.Name == nameof(InstanceSetting.IsActive)));

        var workspaceMember = model.FindEntityType(typeof(WorkspaceMember))!;
        Assert.Contains(workspaceMember.GetIndexes(), index =>
            index.IsUnique &&
            index.Properties.Select(property => property.Name).SequenceEqual([
                nameof(WorkspaceMember.WorkspaceId),
                nameof(WorkspaceMember.UserId)]));
    }

    [Fact]
    public void Migration_contract_adds_safe_authorization_schema_idempotently()
    {
        var resource = typeof(SystemMigrationHostedService).Assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("2026080701_community_authorization.sql", StringComparison.Ordinal));
        using var stream = typeof(SystemMigrationHostedService).Assembly.GetManifestResourceStream(resource)!;
        using var reader = new StreamReader(stream);
        var sql = reader.ReadToEnd();

        Assert.Contains("alter table role add column if not exists key", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("alter table role add column if not exists is_system", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("alter table role add column if not exists is_registration_eligible", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("alter table menu add column if not exists permission_key", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("create unique index if not exists role_key_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("create unique index if not exists menu_permission_key_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("create unique index if not exists permission_role_menu_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("create unique index if not exists user_active_username_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("create unique index if not exists user_active_email_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("lower(username)", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("lower(email)", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("where is_actived and not is_deleted", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("alter table role alter column key set not null", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("alter table menu alter column permission_key set not null", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("is_active boolean not null", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("instance_setting_active_singleton_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("workspace_member_workspace_user_unique", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("token_hash", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("expires_at", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("consumed_at", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("consumed_by", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("target_workspace_id", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("registration_role_id", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("member", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("administrator", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("when 'user' then 'admin.users'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("when 'role' then 'admin.roles'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("when 'auditlog' then 'admin.audit'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("when 'tradelab' then 'tradelab.strategies'", sql, StringComparison.OrdinalIgnoreCase);
         Assert.Contains("unknown menu controller", sql, StringComparison.OrdinalIgnoreCase);
         Assert.Contains("admin.registration", sql, StringComparison.OrdinalIgnoreCase);
         Assert.Contains("registration_menu_count", sql, StringComparison.OrdinalIgnoreCase);
         Assert.Contains("from system_group", sql, StringComparison.OrdinalIgnoreCase);
         Assert.Contains("create unique index if not exists invitation_token_hash_unique", sql, StringComparison.OrdinalIgnoreCase);
         Assert.DoesNotContain("legacy.", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("row_number()", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("first user", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void User_model_does_not_describe_plain_column_indexes_for_lower_expression_indexes()
    {
        using var context = new SystemContext(new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(nameof(User_model_does_not_describe_plain_column_indexes_for_lower_expression_indexes))
            .Options);

        var user = context.Model.FindEntityType(typeof(User))!;

        Assert.DoesNotContain(user.GetIndexes(), index =>
            index.IsUnique && index.Properties.Any(property =>
                property.Name is nameof(User.Username) or nameof(User.Email)));
    }

    private static void AssertRequiredProperties<TEntity>(params string[] properties)
    {
        var type = typeof(TEntity);
        foreach (var property in properties)
        {
            Assert.NotNull(type.GetProperty(property));
        }
    }
}
