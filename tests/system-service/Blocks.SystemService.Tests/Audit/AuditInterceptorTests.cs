using System.Security.Claims;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Interceptors;
using Blocks.SystemService.Infrastructure.Validation;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Blocks.SystemService.Tests.Audit;

public sealed class AuditInterceptorTests
{
    [Fact]
    public async Task SavingChangesAsync_AddsAuditLogForAuthenticatedEntityUpdate()
    {
        var userId = Guid.NewGuid();
        var roleId = Guid.NewGuid();
        var httpContextAccessor = new HttpContextAccessor();
        var interceptor = new AuditInterceptor(httpContextAccessor);
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .AddInterceptors(interceptor)
            .Options;

        await using (var seedContext = new SystemContext(options))
        {
            seedContext.Roles.Add(new Role
            {
                Id = roleId,
                Name = "Administrator",
                Key = "administrator",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed",
                IsActived = true,
                IsDeleted = false,
            });
            seedContext.Users.Add(new User
            {
                Id = userId,
                Username = "admin",
                Fullname = "Admin",
                Password = "hash",
                PasswordSalt = "salt",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed",
                IsActived = true,
                IsDeleted = false,
                RoleId = roleId,
                Email = "admin@example.test",
            });

            await seedContext.SaveChangesAsync();
        }

        httpContextAccessor.HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim("name", userId.ToString()),
                new Claim("unique_name", "admin"),
            ], "test")),
            Request =
            {
                Path = "/api/Role/update-permissions",
            },
        };
        httpContextAccessor.HttpContext.Items["AuditAction"] = "UPDATE_PERMISSIONS";

        await using (var context = new SystemContext(options))
        {
            var role = await context.Roles.SingleAsync(x => x.Id == roleId);
            role.UpdatedAt = DateTime.UtcNow;
            role.UpdatedBy = "admin";

            await context.SaveChangesAsync();
        }

        await using var verifyContext = new SystemContext(options);
        var auditLog = await verifyContext.AuditLogs.SingleOrDefaultAsync(x => x.Action == "UPDATE_PERMISSIONS");

        Assert.NotNull(auditLog);
        Assert.Equal("Role", auditLog.EntityName);
        Assert.Equal(userId, auditLog.UserId);
        Assert.Equal("admin", auditLog.UserName);
        Assert.True(auditLog.IsSuccess);
    }

    [Fact]
    public async Task ScopedSystemContextRegistration_AddsAuditLogForAuthenticatedEntityUpdate()
    {
        var userId = Guid.NewGuid();
        var roleId = Guid.NewGuid();
        var databaseName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();

        services.AddHttpContextAccessor();
        services.AddScoped<ISystemReferenceGuard>(_ => new FakeReferenceGuard(userId));
        services.AddScoped<AuditInterceptor>();
        services.AddDbContext<SystemContext>((sp, options) =>
            options.UseInMemoryDatabase(databaseName)
                .AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));
        services.AddDbContextFactory<SystemContext>(options =>
            options.UseInMemoryDatabase(databaseName),
            ServiceLifetime.Scoped);

        await using var provider = services.BuildServiceProvider();

        await using (var seedScope = provider.CreateAsyncScope())
        {
            var seedContext = seedScope.ServiceProvider.GetRequiredService<SystemContext>();
            seedContext.Roles.Add(new Role
            {
                Id = roleId,
                Name = "Administrator",
                Key = "administrator",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed",
                IsActived = true,
                IsDeleted = false,
            });
            seedContext.Users.Add(new User
            {
                Id = userId,
                Username = "admin",
                Fullname = "Admin",
                Password = "hash",
                PasswordSalt = "salt",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed",
                IsActived = true,
                IsDeleted = false,
                RoleId = roleId,
                Email = "admin@example.test",
            });

            await seedContext.SaveChangesAsync();
        }

        var httpContextAccessor = provider.GetRequiredService<IHttpContextAccessor>();
        httpContextAccessor.HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim("name", userId.ToString()),
                new Claim("unique_name", "admin"),
            ], "test")),
            Request =
            {
                Path = "/api/Role/update-permissions",
            },
        };
        httpContextAccessor.HttpContext.Items["AuditAction"] = "UPDATE_PERMISSIONS";

        await using (var updateScope = provider.CreateAsyncScope())
        {
            var context = updateScope.ServiceProvider.GetRequiredService<SystemContext>();
            var role = await context.Roles.SingleAsync(x => x.Id == roleId);
            role.UpdatedAt = DateTime.UtcNow;
            role.UpdatedBy = "admin";

            await context.SaveChangesAsync();
        }

        await using var verifyScope = provider.CreateAsyncScope();
        var verifyContext = verifyScope.ServiceProvider.GetRequiredService<SystemContext>();
        var auditLog = await verifyContext.AuditLogs.SingleOrDefaultAsync(x => x.Action == "UPDATE_PERMISSIONS");

        Assert.NotNull(auditLog);
    }

    private sealed class FakeReferenceGuard(Guid existingUserId) : ISystemReferenceGuard
    {
        public Task EnsureRoleExistsAsync(Guid roleId, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task EnsureMenuExistsAsync(Guid menuId, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task EnsureSystemGroupExistsAsync(
            Guid systemGroupId,
            string errorMessage,
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task<Guid?> TryResolveExistingUserIdAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(userId == existingUserId ? userId : (Guid?)null);
        }

        public Task<Guid?> TryResolveUserIdByUsernameAsync(string? username, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<Guid?>(existingUserId);
        }
    }
}
