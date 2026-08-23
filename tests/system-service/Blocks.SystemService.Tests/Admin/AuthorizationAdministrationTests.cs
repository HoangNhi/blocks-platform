using Blocks.Shared.Authorization;
using Blocks.Shared.Common;
using Blocks.Shared.Exceptions;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Blocks.SystemService.Services.CoreFeature.Menu;
using Blocks.SystemService.Services.CoreFeature.Role;
using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public sealed class AuthorizationAdministrationTests
{
    [Fact]
    public void PermissionRequestValidator_requires_menu_id()
    {
        var result = new PermissionRequestValidator().Validate(new PermissionRequest { RoleId = Guid.NewGuid() });

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(PermissionRequest.MenuId));
    }

    [Fact]
    public void RoleRequestValidator_requires_stable_key()
    {
        var result = new RoleRequestValidator().Validate(new RoleRequest { Name = "Creator" });

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(RoleRequest.Key));
    }

    [Fact]
    public void MenuRequestValidator_requires_permission_key()
    {
        var result = new MenuRequestValidator().Validate(new MenuRequest
        {
            Name = "Users",
            Controller = "user",
            SystemGroupId = Guid.NewGuid()
        });

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(MenuRequest.PermissionKey));
    }

    [Fact]
    public async Task Protected_roles_cannot_be_deleted_or_have_key_changed()
    {
        var member = NewRole("User", "member", isSystem: true, isRegistrationEligible: true);
        var administrator = NewRole("Administrator", "administrator", isSystem: true);
        await using var context = CreateContext(member, administrator);
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.DeleteList(new DeleteListRequest { Ids = [member.Id] }));
        await Assert.ThrowsAsync<BusinessException>(() => service.Update(new RoleRequest
        {
            Id = member.Id,
            Name = member.Name,
            Key = "renamed-member",
            IsRegistrationEligible = true
        }));
        await Assert.ThrowsAsync<BusinessException>(() => service.DeleteList(new DeleteListRequest { Ids = [administrator.Id] }));
    }

    [Fact]
    public async Task Legacy_protected_role_keys_cannot_be_deleted()
    {
        var legacyMember = NewRole("Legacy User", " member ");
        var legacyAdministrator = NewRole("Legacy Administrator", " ADMINISTRATOR ");
        await using var context = CreateContext(legacyMember, legacyAdministrator);
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.DeleteList(new DeleteListRequest { Ids = [legacyMember.Id] }));
        await Assert.ThrowsAsync<BusinessException>(() => service.DeleteList(new DeleteListRequest { Ids = [legacyAdministrator.Id] }));
    }

    [Fact]
    public async Task Privileged_roles_cannot_be_registration_eligible()
    {
        await using var context = CreateContext();
        var service = CreateRoleService(context);

        await service.Insert(new RoleRequest
        {
            Name = "User",
            Key = "member",
            IsRegistrationEligible = true
        });

        await Assert.ThrowsAsync<BusinessException>(() => service.Insert(new RoleRequest
        {
            Name = "Operator",
            Key = "OpErAtOr",
            IsRegistrationEligible = true
        }));

        var systemRole = NewRole("System", "custom-system", isSystem: true);
        context.Roles.Add(systemRole);
        await context.SaveChangesAsync();

        await Assert.ThrowsAsync<BusinessException>(() => service.Update(new RoleRequest
        {
            Id = systemRole.Id,
            Name = systemRole.Name,
            Key = systemRole.Key,
            IsRegistrationEligible = true
        }));
    }

    [Fact]
    public async Task Protected_role_keys_reject_whitespace_and_persist_canonical_case()
    {
        var member = NewRole("User", "member", isSystem: true, isRegistrationEligible: true);
        await using var context = CreateContext(member);
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.Update(new RoleRequest
        {
            Id = member.Id,
            Name = member.Name,
            Key = " member ",
            IsRegistrationEligible = true
        }));

        var custom = await service.Insert(new RoleRequest
        {
            Name = "Creator",
            Key = "Creator",
            IsRegistrationEligible = false
        });

        Assert.Equal("creator", await context.Roles.Where(role => role.Id == custom.Id).Select(role => role.Key).SingleAsync());
    }

    [Fact]
    public async Task Empty_permission_id_replays_existing_role_menu_row()
    {
        var role = NewRole("Creator", "creator");
        var menu = NewMenu("Users", "admin.users", canView: true);
        var permission = new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = role.Id,
            MenuId = menu.Id,
            IsViewed = false
        };
        await using var context = CreateContext(role, menu, permission);
        var service = CreateRoleService(context);

        await service.UpdatePermissions(new UpdatePermissionsRequest
        {
            Permissions = [new PermissionRequest { RoleId = role.Id, MenuId = menu.Id, IsViewed = true }]
        });

        Assert.Equal(1, await context.Permissions.CountAsync(item => item.RoleId == role.Id && item.MenuId == menu.Id));
        Assert.True(await context.Permissions.Where(item => item.RoleId == role.Id && item.MenuId == menu.Id).Select(item => item.IsViewed).SingleAsync());
    }

    [Fact]
    public async Task Roles_with_admin_permissions_cannot_be_registration_eligible()
    {
        var role = NewRole("Auditor", "auditor");
        var menu = NewMenu("Audit", "admin.audit", canView: true);
        await using var context = CreateContext(role, menu, new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = role.Id,
            MenuId = menu.Id,
            IsViewed = true
        });
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.Update(new RoleRequest
        {
            Id = role.Id,
            Name = role.Name,
            Key = role.Key,
            IsRegistrationEligible = true
        }));
    }

    [Fact]
    public async Task Default_registration_role_cannot_become_ineligible()
    {
        var role = NewRole("Creator", "creator", isRegistrationEligible: true);
        await using var context = CreateContext(role);
        context.InstanceSettings.Add(new InstanceSetting
        {
            Id = Guid.NewGuid(),
            RegistrationMode = "admin_provisioned",
            DefaultRegistrationRoleId = role.Id,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false
        });
        await context.SaveChangesAsync();
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.Update(new RoleRequest
        {
            Id = role.Id,
            Name = role.Name,
            Key = role.Key,
            IsRegistrationEligible = false
        }));
    }

    [Fact]
    public async Task Unsupported_actions_and_duplicate_permission_rows_are_rejected()
    {
        var role = NewRole("Creator", "creator");
        var menu = new Menu
        {
            Id = Guid.NewGuid(),
            Controller = "user",
            Name = "Users",
            PermissionKey = "admin.users",
            SystemGroupId = Guid.NewGuid(),
            IsActived = true,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            CanView = false
        };
        await using var context = CreateContext(role, menu);
        var service = CreateRoleService(context);

        var unsupported = new PermissionRequest { RoleId = role.Id, MenuId = menu.Id, IsViewed = true };
        await Assert.ThrowsAsync<BusinessException>(() => service.UpdatePermissions(new UpdatePermissionsRequest { Permissions = [unsupported] }));

        menu.CanView = true;
        await context.SaveChangesAsync();
        var first = new PermissionRequest { RoleId = role.Id, MenuId = menu.Id };
        var second = new PermissionRequest { RoleId = role.Id, MenuId = menu.Id };
        await Assert.ThrowsAsync<BusinessException>(() => service.UpdatePermissions(new UpdatePermissionsRequest { Permissions = [first, second] }));
    }

    [Fact]
    public async Task Permission_row_identity_must_match_request_keys()
    {
        var role = NewRole("Creator", "creator");
        var otherRole = NewRole("Other", "other");
        var menu = NewMenu("Users", "admin.users", canView: true);
        var otherMenu = NewMenu("Audit", "admin.audit", canView: true);
        var permission = new Permission
        {
            Id = Guid.NewGuid(),
            RoleId = role.Id,
            MenuId = menu.Id
        };
        await using var context = CreateContext(role, otherRole, menu, otherMenu, permission);
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.UpdatePermissions(new UpdatePermissionsRequest
        {
            Permissions = [new PermissionRequest { Id = permission.Id, RoleId = otherRole.Id, MenuId = otherMenu.Id }]
        }));
    }

    [Fact]
    public void Administration_endpoints_use_stable_permission_keys()
    {
        Assert.Equal("admin.users", PermissionKey<UserController>(nameof(UserController.GetList)));
        Assert.Equal("admin.roles", PermissionKey<RoleController>(nameof(RoleController.GetList)));
        Assert.Equal("admin.permissions", PermissionKey<RoleController>(nameof(RoleController.UpdatePermissions)));
        Assert.Equal("admin.permissions", PermissionKey<MenuController>(nameof(MenuController.GetList)));
        Assert.Equal("admin.permissions", PermissionKey<SystemGroupController>(nameof(SystemGroupController.GetList)));
        Assert.Equal("admin.permissions", PermissionKey<RoleController>(nameof(RoleController.GetPermissionsByRole)));
        Assert.Equal("admin.audit", PermissionKey<AuditLogController>("GetList"));
    }

    [Fact]
    public async Task User_specific_queries_allow_self_and_require_matching_admin_permission_for_other_subject()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var service = new StubFunctionalAuthorizationService(true);

        var selfFilter = new AttributePermission
        {
            Action = ActionType.NONE,
            PermissionKey = "admin.permissions",
            SubjectIdQueryParameter = "id"
        };
        var selfContext = CreateFilterContext(userId, userId, service);
        await selfFilter.OnAuthorizationAsync(selfContext);
        Assert.Null(selfContext.Result);
        Assert.Null(service.LastCall);

        var otherFilter = new AttributePermission
        {
            Action = ActionType.NONE,
            PermissionKey = "admin.permissions",
            SubjectIdQueryParameter = "id"
        };
        var otherContext = CreateFilterContext(userId, otherUserId, service);
        await otherFilter.OnAuthorizationAsync(otherContext);
        Assert.Null(otherContext.Result);
        Assert.Equal((userId, "admin.permissions", FunctionalPermissionAction.VIEW, null), service.LastCall);

        var deniedService = new StubFunctionalAuthorizationService(false);
        var deniedFilter = new AttributePermission
        {
            Action = ActionType.NONE,
            PermissionKey = "admin.permissions",
            SubjectIdQueryParameter = "id"
        };
        var deniedContext = CreateFilterContext(userId, otherUserId, deniedService);
        await deniedFilter.OnAuthorizationAsync(deniedContext);
        Assert.IsType<ForbidResult>(deniedContext.Result);
    }

    [Fact]
    public async Task Malformed_subject_id_is_forbidden()
    {
        var userId = Guid.NewGuid();
        var filter = new AttributePermission { Action = ActionType.NONE, SubjectIdQueryParameter = "id" };
        var context = CreateFilterContext(userId, null, new StubFunctionalAuthorizationService(true));
        context.HttpContext.Request.QueryString = new QueryString("?id=not-a-guid");

        await filter.OnAuthorizationAsync(context);

        Assert.IsType<ForbidResult>(context.Result);
    }

    [Fact]
    public async Task Authorization_service_failure_is_forbidden()
    {
        var filter = new AttributePermission { Action = ActionType.NONE, PermissionKey = "admin.permissions", SubjectIdQueryParameter = "id" };
        var context = CreateFilterContext(Guid.NewGuid(), Guid.NewGuid(), new ThrowingFunctionalAuthorizationService());

        await filter.OnAuthorizationAsync(context);

        var unavailable = Assert.IsType<StatusCodeResult>(context.Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
    }

    [Fact]
    public void User_combobox_requires_authentication()
    {
        var method = typeof(UserController).GetMethod(nameof(UserController.GetAllForCombobox));

        Assert.Empty(method!.GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute), true));
    }

    private static string? PermissionKey<TController>(string actionName)
    {
        var method = typeof(TController).GetMethod(actionName);
        return method?.GetCustomAttributes(typeof(AttributePermission), true)
            .Cast<AttributePermission>()
            .Single()
            .PermissionKey;
    }

    private static AuthorizationFilterContext CreateFilterContext(
        Guid userId,
        Guid? subjectId,
        IFunctionalAuthorizationService service)
    {
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("name", userId.ToString())], "test")),
            RequestServices = new ServiceCollection().AddSingleton(service).BuildServiceProvider()
        };
        if (subjectId.HasValue)
        {
            httpContext.Request.QueryString = new QueryString($"?id={subjectId.Value}");
        }
        return new AuthorizationFilterContext(
            new ActionContext(httpContext, new RouteData(), new ControllerActionDescriptor
            {
                ControllerName = "Menu",
                ActionName = "GetListByUser"
            }),
            []);
    }

    private static RoleService CreateRoleService(SystemContext context)
    {
        var mapperConfiguration = new MapperConfigurationExpression();
        mapperConfiguration.AddProfile<Blocks.SystemService.Services.CoreFeature.Role.RoleProfile>();
        var mapper = new Mapper(new MapperConfiguration(mapperConfiguration, Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory.Instance));
        return new RoleService(context, mapper, new HttpContextAccessor(), new TestReferenceGuard(context));
    }

    private static SystemContext CreateContext(params object[] entities)
    {
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new SystemContext(options);
        foreach (var entity in entities)
        {
            context.Add(entity);
        }
        context.SaveChanges();
        return context;
    }

    private static Role NewRole(string name, string key, bool isSystem = false, bool isRegistrationEligible = false) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        Key = key,
        IsSystem = isSystem,
        IsRegistrationEligible = isRegistrationEligible,
        IsActived = true,
        IsDeleted = false,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test"
    };

    private static Menu NewMenu(string name, string permissionKey, bool canView = false) => new()
    {
        Id = Guid.NewGuid(),
        Controller = name.ToLowerInvariant(),
        Name = name,
        PermissionKey = permissionKey,
        SystemGroupId = Guid.NewGuid(),
        IsActived = true,
        IsDeleted = false,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test",
        CanView = canView
    };

    private sealed class TestReferenceGuard(SystemContext context) : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default) =>
            context.Roles.Any(role => role.Id == roleId && !role.IsDeleted)
                ? Task.CompletedTask
                : throw new BusinessException("Vai trò không tồn tại.");

        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default) =>
            context.Menus.Any(menu => menu.Id == menuId && !menu.IsDeleted)
                ? Task.CompletedTask
                : throw new BusinessException("Menu không tồn tại.");

        public Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(userId);
        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
    }

    private sealed class StubFunctionalAuthorizationService(bool result) : IFunctionalAuthorizationService
    {
        public (Guid UserId, string? PermissionKey, FunctionalPermissionAction Action, string? Controller)? LastCall { get; private set; }

        public Task<bool> CheckAsync(Guid userId, string? permissionKey, FunctionalPermissionAction action, string? controller = null, CancellationToken cancellationToken = default)
        {
            LastCall = (userId, permissionKey, action, controller);
            return Task.FromResult(result);
        }
    }

    private sealed class ThrowingFunctionalAuthorizationService : IFunctionalAuthorizationService
    {
        public Task<bool> CheckAsync(Guid userId, string? permissionKey, FunctionalPermissionAction action, string? controller = null, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("authorization unavailable");
    }
}
