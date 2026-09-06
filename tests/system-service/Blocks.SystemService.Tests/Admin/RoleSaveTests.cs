using System.Security.Claims;
using AutoMapper;
using Blocks.Shared.Authorization;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Blocks.SystemService.Services.CoreFeature.Role;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public sealed class RoleSaveTests
{
    [Fact]
    public async Task Save_switches_registration_role_and_default()
    {
        var existingRole = NewRole("Member", "member");
        existingRole.IsRegistrationEligible = true;
        var replacementRole = NewRole("Creator", "creator");
        var setting = NewRegistrationSetting(existingRole.Id);
        await using var context = CreateContext(existingRole, replacementRole, setting);
        var service = CreateRoleService(context, new StubAuthorizationService("admin.roles"), replacementRole.Id);

        await service.Save(new RoleSaveRequest
        {
            Id = replacementRole.Id,
            Details = new RoleSaveDetailsRequest
            {
                Name = replacementRole.Name,
                Key = replacementRole.Key,
                IsActived = true,
                IsRegistrationEligible = true,
            },
        });

        Assert.False((await context.Roles.SingleAsync(role => role.Id == existingRole.Id)).IsRegistrationEligible);
        Assert.True((await context.Roles.SingleAsync(role => role.Id == replacementRole.Id)).IsRegistrationEligible);
        Assert.Equal(replacementRole.Id, await context.InstanceSettings.Select(value => value.DefaultRegistrationRoleId).SingleAsync());
    }

    [Fact]
    public async Task Save_can_clear_current_registration_default()
    {
        var role = NewRole("Member", "member");
        role.IsRegistrationEligible = true;
        var setting = NewRegistrationSetting(role.Id);
        await using var context = CreateContext(role, setting);
        var service = CreateRoleService(context, new StubAuthorizationService("admin.roles"), role.Id);

        await service.Save(new RoleSaveRequest
        {
            Id = role.Id,
            Details = new RoleSaveDetailsRequest
            {
                Name = role.Name,
                Key = role.Key,
                IsActived = true,
                IsRegistrationEligible = false,
            },
        });

        Assert.False((await context.Roles.SingleAsync()).IsRegistrationEligible);
        Assert.Null(await context.InstanceSettings.Select(value => value.DefaultRegistrationRoleId).SingleAsync());
    }

    [Fact]
    public async Task PermissionOnlySaveUsesPermissionScopeAndRevokesExplicitFalseValues()
    {
        var role = NewRole("Member", "member");
        var menu = NewMenu("Registration", "workspace.home");
        var permission = NewPermission(role.Id, menu.Id, isViewed: true);
        await using var context = CreateContext(role, menu, permission);
        var auth = new StubAuthorizationService("admin.permissions");
        var service = CreateRoleService(context, auth, role.Id);

        var result = await service.Save(new RoleSaveRequest
        {
            Id = role.Id,
            Permissions = [new PermissionRequest
            {
                Id = permission.Id,
                RoleId = role.Id,
                MenuId = menu.Id,
                IsViewed = false,
            }],
        });

        Assert.False(result.SavedScopes.Details);
        Assert.True(result.SavedScopes.Permissions);
        Assert.False((await context.Permissions.SingleAsync()).IsViewed);
        Assert.DoesNotContain(auth.Calls, call => call.PermissionKey == "admin.roles");
    }

    [Fact]
    public async Task CombinedSaveRequiresBothScopesAndRejectsUnsafeEligibleFinalState()
    {
        var role = NewRole("Custom", "custom");
        var menu = NewMenu("Files", "admin.files");
        await using var context = CreateContext(role, menu);
        var auth = new StubAuthorizationService("admin.roles", "admin.permissions");
        var service = CreateRoleService(context, auth, role.Id);

        var error = await Assert.ThrowsAsync<BusinessException>(() => service.Save(new RoleSaveRequest
        {
            Id = role.Id,
            Details = new RoleSaveDetailsRequest
            {
                Name = role.Name,
                Key = role.Key,
                IsActived = true,
                IsRegistrationEligible = true,
            },
            Permissions = [new PermissionRequest
            {
                RoleId = role.Id,
                MenuId = menu.Id,
                IsViewed = true,
            }],
        }));

        Assert.Contains("khong an toan", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.False((await context.Roles.SingleAsync()).IsRegistrationEligible);
        Assert.Empty(context.Permissions);
    }

    [Fact]
    public async Task UnsupportedGrantAndMissingScopeAreRejected()
    {
        var role = NewRole("Custom", "custom");
        var menu = NewMenu("Files", "files", canView: false);
        await using var context = CreateContext(role, menu);
        var auth = new StubAuthorizationService("admin.permissions");
        var service = CreateRoleService(context, auth, role.Id);

        await Assert.ThrowsAsync<BusinessException>(() => service.Save(new RoleSaveRequest { Id = role.Id }));
        var error = await Assert.ThrowsAsync<BusinessException>(() => service.Save(new RoleSaveRequest
        {
            Id = role.Id,
            Permissions = [new PermissionRequest { RoleId = role.Id, MenuId = menu.Id, IsViewed = true }],
        }));

        Assert.Contains("menu ho tro", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AuthorizationFailureIsFailClosed()
    {
        var role = NewRole("Custom", "custom");
        await using var context = CreateContext(role);
        var service = CreateRoleService(context, new StubAuthorizationService(), role.Id);

        var error = await Assert.ThrowsAsync<BusinessException>(() => service.Save(new RoleSaveRequest
        {
            Id = role.Id,
            Details = new RoleSaveDetailsRequest
            {
                Name = "Renamed",
                Key = role.Key,
                IsActived = true,
                IsRegistrationEligible = false,
            },
        }));

        Assert.Equal(403, error.StatusCode);
        Assert.Equal("Custom", (await context.Roles.SingleAsync()).Name);
    }

    private static RoleService CreateRoleService(SystemContext context, IFunctionalAuthorizationService authorization, Guid userId)
    {
        var configuration = new MapperConfigurationExpression();
        configuration.AddProfile<RoleProfile>();
        var mapper = new Mapper(new MapperConfiguration(configuration, NullLoggerFactory.Instance));
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("name", userId.ToString())], "test")),
        };
        var accessor = new HttpContextAccessor { HttpContext = httpContext };
        return new RoleService(context, mapper, accessor, new TestReferenceGuard(), authorization);
    }

    private static SystemContext CreateContext(params object[] entities)
    {
        var options = new DbContextOptionsBuilder<SystemContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var context = new SystemContext(options);
        foreach (var entity in entities) context.Add(entity);
        context.SaveChanges();
        return context;
    }

    private static Role NewRole(string name, string key) => new()
    {
        Id = Guid.NewGuid(), Name = name, Key = key, IsActived = true, IsDeleted = false,
        CreatedAt = DateTime.UtcNow, CreatedBy = "test",
    };

    private static InstanceSetting NewRegistrationSetting(Guid roleId) => new()
    {
        Id = Guid.NewGuid(), RegistrationMode = "open", DefaultRegistrationRoleId = roleId,
        CreatedAt = DateTime.UtcNow, CreatedBy = "test", IsActive = true, IsDeleted = false,
    };

    private static Menu NewMenu(string name, string key, bool canView = true) => new()
    {
        Id = Guid.NewGuid(), Controller = name.ToLowerInvariant(), Name = name, PermissionKey = key,
        SystemGroupId = Guid.NewGuid(), IsActived = true, IsDeleted = false, CanView = canView,
        CreatedAt = DateTime.UtcNow, CreatedBy = "test",
    };

    private static Permission NewPermission(Guid roleId, Guid menuId, bool isViewed = false) => new()
    {
        Id = Guid.NewGuid(), RoleId = roleId, MenuId = menuId, IsViewed = isViewed,
    };

    private sealed class TestReferenceGuard : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(userId);
        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
    }

    private sealed class StubAuthorizationService(params string[] allowedKeys) : IFunctionalAuthorizationService
    {
        private readonly HashSet<string> _allowedKeys = allowedKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        public List<(string? PermissionKey, FunctionalPermissionAction Action)> Calls { get; } = [];

        public Task<bool> CheckAsync(Guid userId, string? permissionKey, FunctionalPermissionAction action, string? controller = null, CancellationToken cancellationToken = default)
        {
            Calls.Add((permissionKey, action));
            return Task.FromResult(permissionKey is not null && _allowedKeys.Contains(permissionKey));
        }
    }
}
