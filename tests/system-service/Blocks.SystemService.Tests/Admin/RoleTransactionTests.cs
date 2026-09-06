using AutoMapper;
using Blocks.Shared.Exceptions;
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

public sealed class RoleTransactionTests
{
    [Fact]
    public async Task Inserting_registration_eligible_role_replaces_existing_registration_role()
    {
        var existingRole = NewRole("Member", "member");
        existingRole.IsRegistrationEligible = true;
        var setting = new InstanceSetting
        {
            Id = Guid.NewGuid(),
            RegistrationMode = "open",
            DefaultRegistrationRoleId = existingRole.Id,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false,
        };
        await using var context = CreateContext(existingRole, setting);
        var service = CreateRoleService(context);

        var created = await service.Insert(new RoleRequest
        {
            Id = Guid.NewGuid(),
            Name = "Creator",
            Key = "creator",
            IsRegistrationEligible = true,
        });

        Assert.True(created.IsRegistrationEligible);
        Assert.False(await context.Roles.Where(role => role.Id == existingRole.Id).Select(role => role.IsRegistrationEligible).SingleAsync());
        Assert.Equal(created.Id, await context.InstanceSettings.Select(value => value.DefaultRegistrationRoleId).SingleAsync());
    }

    [Fact]
    public async Task Updating_registration_eligible_role_replaces_existing_registration_role()
    {
        var existingRole = NewRole("Member", "member");
        existingRole.IsRegistrationEligible = true;
        var replacementRole = NewRole("Creator", "creator");
        var setting = new InstanceSetting
        {
            Id = Guid.NewGuid(),
            RegistrationMode = "open",
            DefaultRegistrationRoleId = existingRole.Id,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false,
        };
        await using var context = CreateContext(existingRole, replacementRole, setting);
        var service = CreateRoleService(context);

        var updated = await service.Update(new RoleRequest
        {
            Id = replacementRole.Id,
            Name = replacementRole.Name,
            Key = replacementRole.Key,
            IsRegistrationEligible = true,
            IsActived = true,
        });

        Assert.True(updated.IsRegistrationEligible);
        Assert.False(await context.Roles.Where(role => role.Id == existingRole.Id).Select(role => role.IsRegistrationEligible).SingleAsync());
        Assert.Equal(replacementRole.Id, await context.InstanceSettings.Select(value => value.DefaultRegistrationRoleId).SingleAsync());
    }

    [Fact]
    public async Task Disabling_current_registration_role_clears_registration_default()
    {
        var role = NewRole("Member", "member");
        role.IsRegistrationEligible = true;
        var setting = new InstanceSetting
        {
            Id = Guid.NewGuid(),
            RegistrationMode = "open",
            DefaultRegistrationRoleId = role.Id,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test",
            IsActive = true,
            IsDeleted = false,
        };
        await using var context = CreateContext(role, setting);
        var service = CreateRoleService(context);

        var updated = await service.Update(new RoleRequest
        {
            Id = role.Id,
            Name = role.Name,
            Key = role.Key,
            IsRegistrationEligible = false,
            IsActived = true,
        });

        Assert.False(updated.IsRegistrationEligible);
        Assert.Null(await context.InstanceSettings.Select(value => value.DefaultRegistrationRoleId).SingleAsync());
    }

    [Fact]
    public async Task MixedDeleteBatchValidatesBeforeMutation()
    {
        var deletable = NewRole("Custom", "custom");
        var protectedRole = NewRole("Member", "member");
        await using var context = CreateContext(deletable, protectedRole);
        var service = CreateRoleService(context);

        await Assert.ThrowsAsync<BusinessException>(() => service.DeleteList(new Blocks.Shared.DTOs.Base.DeleteListRequest
        {
            Ids = [deletable.Id, protectedRole.Id],
        }));

        Assert.False((await context.Roles.SingleAsync(role => role.Id == deletable.Id)).IsDeleted);
        Assert.False((await context.Roles.SingleAsync(role => role.Id == protectedRole.Id)).IsDeleted);
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

    private sealed class TestReferenceGuard : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task EnsureSystemGroupExistsAsync(Guid systemGroupId, string errorMessage, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(userId);
        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
    }
}
