using AutoMapper;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Role;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blocks.SystemService.Tests.Admin;

public sealed class RoleServiceGetListTests
{
    [Fact]
    public async Task FiltersSearchBeforePagingAndUsesStableOrdering()
    {
        var matchingRoles = Enumerable.Range(1, 25)
            .Select(index => NewRole($"Matching {index:00}", $"matching.{index:00}", index % 2 == 0, index % 3 == 0))
            .ToArray();
        await using var context = CreateContext(matchingRoles);
        var service = CreateRoleService(context);

        var result = await service.GetList(new RoleGetListPagingRequest
        {
            TextSearch = "MATCHING",
            IsSystem = false,
            IsRegistrationEligible = true,
            PageIndex = 1,
            PageSize = 100,
        });

        Assert.Equal(4, result.TotalRow);
        Assert.Equal(4, result.Data.Count);
        Assert.Equal(result.Data.OrderBy(role => role.Name).ThenBy(role => role.Id).Select(role => role.Id), result.Data.Select(role => role.Id));

        var secondPage = await service.GetList(new RoleGetListPagingRequest
        {
            TextSearch = "matching",
            PageIndex = 2,
            PageSize = 20,
        });

        Assert.Equal(25, secondPage.TotalRow);
        Assert.Equal(5, secondPage.Data.Count);
        Assert.Equal(2, secondPage.PageIndex);
        Assert.Equal(20, secondPage.PageSize);
    }

    [Fact]
    public async Task FalseFiltersArePreservedAndRestrictionMetadataIsAggregated()
    {
        var systemRole = NewRole("System", "system", isSystem: true);
        var memberRole = NewRole("Member", " MEMBER ");
        var defaultRole = NewRole("Default", "default", isRegistrationEligible: true);
        var assignedRole = NewRole("Assigned", "assigned");
        var inactiveRole = NewRole("Inactive", "inactive");
        var setting = new InstanceSetting
        {
            Id = Guid.NewGuid(),
            RegistrationMode = "open",
            DefaultRegistrationRoleId = defaultRole.Id,
            IsActive = true,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
        };
        var inactiveUser = new User
        {
            Id = Guid.NewGuid(),
            Username = "inactive",
            Fullname = "Inactive",
            Password = "password",
            PasswordSalt = "salt",
            Email = "inactive@example.com",
            RoleId = assignedRole.Id,
            IsActived = false,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
        };
        await using var context = CreateContext(systemRole, memberRole, defaultRole, assignedRole, inactiveRole, setting, inactiveUser);
        var service = CreateRoleService(context);

        var result = await service.GetList(new RoleGetListPagingRequest
        {
            IsActived = false,
            PageIndex = 1,
            PageSize = 20,
        });

        Assert.Empty(result.Data);

        var all = await service.GetList(new RoleGetListPagingRequest
        {
            PageIndex = 1,
            PageSize = 20,
        });
        var system = Assert.Single(all.Data, role => role.Key == "system");
        var member = Assert.Single(all.Data, role => role.Key == " MEMBER ");
        var currentDefault = Assert.Single(all.Data, role => role.Id == defaultRole.Id);
        var assigned = Assert.Single(all.Data, role => role.Id == assignedRole.Id);

        Assert.True(system.IsProtected);
        Assert.False(system.CanDeactivate);
        Assert.False(system.CanDelete);
        Assert.Equal("Vai trò hệ thống hoặc bảo vệ không thể vô hiệu hóa", system.DeactivationBlockedReason);
        Assert.Equal("Vai trò hệ thống hoặc bảo vệ không thể xóa", system.DeleteBlockedReason);
        Assert.True(member.IsProtected);
        Assert.False(member.CanDelete);
        Assert.False(currentDefault.CanDeactivate);
        Assert.False(currentDefault.CanDelete);
        Assert.False(assigned.CanDelete);
        Assert.Contains("người dùng", assigned.DeleteBlockedReason ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    private static RoleService CreateRoleService(SystemContext context)
    {
        var configuration = new MapperConfigurationExpression();
        configuration.AddProfile<RoleProfile>();
        var mapper = new Mapper(new MapperConfiguration(configuration, NullLoggerFactory.Instance));
        return new RoleService(context, mapper, new HttpContextAccessor(), new TestReferenceGuard());
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
        CreatedBy = "test",
    };

    private sealed class TestReferenceGuard : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(userId);
        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
    }
}
