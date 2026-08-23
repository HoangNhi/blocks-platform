using Blocks.SystemService.Controllers;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Reflection;
using Xunit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.Shared.Exceptions;

namespace Blocks.SystemService.Tests.Auth;

public sealed class BootstrapServiceTests
{
    [Fact]
    public void Bootstrap_endpoint_is_anonymous_rate_limited_and_has_expected_route()
    {
        var method = typeof(AuthController).GetMethod(nameof(AuthController.Bootstrap));

        Assert.NotNull(method);
        Assert.NotEmpty(method!.GetCustomAttributes(typeof(AllowAnonymousAttribute), true));
        Assert.Equal("bootstrap", method.GetCustomAttribute<RouteAttribute>()!.Template);
        Assert.Equal("bootstrap", method.GetCustomAttribute<EnableRateLimitingAttribute>()!.PolicyName);
    }

    [Fact]
    public void Environment_secret_takes_precedence_and_configuration_is_fallback()
    {
        Assert.Equal("environment", AuthController.ResolveBootstrapSecret("environment", "configuration"));
        Assert.Equal("configuration", AuthController.ResolveBootstrapSecret(null, "configuration"));
        Assert.Equal(string.Empty, AuthController.ResolveBootstrapSecret(" ", null));
    }

    [Fact]
    public void Bootstrap_advisory_lock_contract_is_distinct_from_migration_lock()
    {
        Assert.Equal(42425254, BootstrapAdvisoryLock.LockKey);
        Assert.NotEqual(SystemMigrationHostedService.AdvisoryLockKey, BootstrapAdvisoryLock.LockKey);
        Assert.Contains("pg_advisory_xact_lock", BootstrapAdvisoryLock.LockCommandText);
    }

    [Fact]
    public void Bootstrap_secret_comparison_requires_equal_utf8_bytes()
    {
        Assert.True(RegistrationService.IsBootstrapSecretValid("secret", "secret"));
        Assert.False(RegistrationService.IsBootstrapSecretValid("secret", "wrong"));
        Assert.False(RegistrationService.IsBootstrapSecretValid("secret", "SECRET"));
    }

    [Fact]
    public void Rejected_bootstrap_audit_allows_null_user_and_contains_no_secret_fields()
    {
        Assert.Null(new AuditLog { UserId = null }.UserId);
        Assert.DoesNotContain("Secret", typeof(AuditLog).GetProperties().Select(x => x.Name));
    }

    [Fact]
    public async Task Bootstrap_invalid_secret_passes_null_user_id_to_audit_writer()
    {
        await using var context = CreateContext();
        var auditWriter = new CapturingAuditWriter();
        var service = CreateService(context, auditWriter: auditWriter, bootstrapLock: new LockSpy());

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.BootstrapAsync(Request(), "127.0.0.1", "configured", "wrong"));

        Assert.Equal(404, exception.StatusCode);
        Assert.Single(auditWriter.Audits);
        Assert.Null(auditWriter.Audits[0].UserId);
    }

    [Fact]
    public async Task Bootstrap_invalid_secret_keeps_404_when_audit_writer_fails()
    {
        await using var context = CreateContext();
        var service = CreateService(context, auditWriter: new ThrowingAuditWriter());

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.BootstrapAsync(Request(), "127.0.0.1", "configured", "wrong"));

        Assert.Equal(404, exception.StatusCode);
        Assert.DoesNotContain("configured", exception.Message);
        Assert.DoesNotContain("wrong", exception.Message);
    }

    [Fact]
    public async Task Bootstrap_invokes_advisory_lock_before_checks()
    {
        await using var context = CreateContext();
        var lockSpy = new LockSpy();
        var service = CreateService(context, bootstrapLock: lockSpy);

        await Assert.ThrowsAsync<BusinessException>(() => service.BootstrapAsync(Request(), "127.0.0.1", "configured", "configured"));

        Assert.Equal(1, lockSpy.Count);
    }

    [Fact]
    public async Task Bootstrap_creates_administrator_workspace_membership_and_audit()
    {
        await using var context = CreateContext();
        var administratorRole = AddRole(context, "administrator", isSystem: true);
        await context.SaveChangesAsync();
        var auditWriter = new CapturingAuditWriter();
        var service = CreateService(context, auditWriter: auditWriter, bootstrapLock: new LockSpy());

        var result = await service.BootstrapAsync(Request(), "127.0.0.1", "configured", "configured");

        var user = Assert.Single(context.Users);
        var workspace = Assert.Single(context.Workspaces);
        var membership = Assert.Single(context.WorkspaceMembers);
        Assert.Equal(administratorRole.Id, user.RoleId);
        Assert.Equal(user.Id, membership.UserId);
        Assert.Equal(workspace.Id, membership.WorkspaceId);
        Assert.Equal(workspace.Id, result.WorkspaceId);
        Assert.Equal(RegistrationModes.AdminProvisioned, Assert.Single(context.InstanceSettings).RegistrationMode);
        Assert.Contains(auditWriter.Audits, audit => audit.Action == "BOOTSTRAP" && audit.UserId == user.Id);
    }

    [Fact]
    public async Task Bootstrap_rejects_existing_administrator_and_keeps_existing_rows()
    {
        await using var context = CreateContext();
        var administratorRole = AddRole(context, "administrator", isSystem: true);
        context.Users.Add(new User
        {
            Id = Guid.NewGuid(), Username = "existing-admin", Email = "existing-admin@example.test", Fullname = "Existing Admin",
            Password = "password", PasswordSalt = "salt", RoleId = administratorRole.Id,
            CreatedAt = DateTime.UtcNow, CreatedBy = "test", IsActived = true, IsDeleted = false
        });
        await context.SaveChangesAsync();
        var service = CreateService(context, bootstrapLock: new LockSpy());

        var exception = await Assert.ThrowsAsync<BusinessException>(() =>
            service.BootstrapAsync(Request(), "127.0.0.1", "configured", "configured"));

        Assert.Equal(404, exception.StatusCode);
        Assert.Single(context.Users);
        Assert.Empty(context.Workspaces);
    }

    [Fact]
    public async Task Bootstrap_is_unavailable_after_successful_initialization()
    {
        await using var context = CreateContext();
        AddRole(context, "administrator", isSystem: true);
        await context.SaveChangesAsync();
        var service = CreateService(context, bootstrapLock: new LockSpy());

        await service.BootstrapAsync(Request(), "127.0.0.1", "configured", "configured");

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.BootstrapAsync(
            new RegisterRequest
            {
                Username = "second-admin",
                Email = "second-admin@example.test",
                Fullname = "Second Admin",
                Password = "password-long-enough"
            },
            "127.0.0.1",
            "configured",
            "configured"));

        Assert.Equal(404, exception.StatusCode);
        Assert.Single(context.Users);
        Assert.Single(context.Workspaces);
    }

    [Fact]
    public async Task Concurrent_bootstrap_requests_allow_one_success()
    {
        var databaseName = Guid.NewGuid().ToString();
        var options = new DbContextOptionsBuilder<SystemContext>()
            .UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(builder => builder.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        await using var firstContext = new SystemContext(options);
        await using var secondContext = new SystemContext(options);
        AddRole(firstContext, "administrator", isSystem: true);
        await firstContext.SaveChangesAsync();
        var bootstrapLock = new CoordinatedBootstrapLock();
        var firstService = CreateService(firstContext, bootstrapLock: bootstrapLock);
        var secondService = CreateService(secondContext, bootstrapLock: bootstrapLock);

        var firstTask = CaptureBootstrapAsync(firstService, Request(), bootstrapLock.Release);
        await bootstrapLock.FirstAcquired.WaitAsync(TimeSpan.FromSeconds(5));
        var secondTask = CaptureBootstrapAsync(secondService, new RegisterRequest
        {
            Username = "second-admin",
            Email = "second-admin@example.test",
            Fullname = "Second Admin",
            Password = "password-long-enough"
        });
        await bootstrapLock.SecondAttempted.WaitAsync(TimeSpan.FromSeconds(5));

        bootstrapLock.AllowFirstToContinue();
        var outcomes = await Task.WhenAll(firstTask, secondTask);

        Assert.True(outcomes[0].Succeeded);
        Assert.False(outcomes[1].Succeeded);
        Assert.Equal(404, outcomes[1].StatusCode);
        Assert.Single(firstContext.Users);
        Assert.Single(firstContext.Workspaces);
    }

    [Fact]
    public void Bootstrap_migration_makes_audit_user_nullable()
    {
        var resource = SystemMigrationHostedService.GetMigrationResourceNames(typeof(SystemMigrationHostedService).Assembly)
            .Single(x => x.EndsWith("2026081301_bootstrap_audit_nullable.sql", StringComparison.Ordinal));
        var migration = SystemMigrationHostedService.ReadMigrationSql(typeof(SystemMigrationHostedService).Assembly, resource);
        Assert.Contains("user_id drop not null", migration, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Bootstrap:Secret", migration, StringComparison.Ordinal);
    }

    private static RegistrationService CreateService(SystemContext context, IRegistrationAuditWriter? auditWriter = null, IBootstrapAdvisoryLock? bootstrapLock = null)
    {
        return new RegistrationService(context, new RegistrationWorkspaceProvisioner(), auditWriter ?? new RegistrationAuditWriter(), new RegistrationInvitationConsumer(), bootstrapLock);
    }

    private static RegisterRequest Request() => new()
    {
        Username = "admin", Email = "admin@example.test", Fullname = "Admin", Password = "password-long-enough"
    };

    private static Role AddRole(SystemContext context, string key, bool isSystem)
    {
        var role = new Role
        {
            Id = Guid.NewGuid(), Name = key, Key = key, IsSystem = isSystem,
            IsActived = true, IsDeleted = false, CreatedAt = DateTime.UtcNow, CreatedBy = "test"
        };
        context.Roles.Add(role);
        return role;
    }

    private static SystemContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SystemContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).ConfigureWarnings(x => x.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options;
        return new SystemContext(options);
    }

    private static async Task<BootstrapOutcome> CaptureBootstrapAsync(
        RegistrationService service,
        RegisterRequest request,
        Action? completed = null)
    {
        try
        {
            await service.BootstrapAsync(request, "127.0.0.1", "configured", "configured");
            return new BootstrapOutcome(true, null);
        }
        catch (BusinessException exception)
        {
            return new BootstrapOutcome(false, exception.StatusCode);
        }
        finally
        {
            completed?.Invoke();
        }
    }

    private sealed record BootstrapOutcome(bool Succeeded, int? StatusCode);

    private sealed class LockSpy : IBootstrapAdvisoryLock
    {
        public int Count { get; private set; }
        public Task AcquireAsync(CancellationToken cancellationToken = default)
        {
            Count++;
            return Task.CompletedTask;
        }
    }

    private sealed class CoordinatedBootstrapLock : IBootstrapAdvisoryLock
    {
        private readonly SemaphoreSlim gate = new(1, 1);
        private readonly TaskCompletionSource<bool> firstAcquired = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<bool> secondAttempted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<bool> firstMayContinue = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int attempts;

        public Task FirstAcquired => firstAcquired.Task;
        public Task SecondAttempted => secondAttempted.Task;

        public async Task AcquireAsync(CancellationToken cancellationToken = default)
        {
            var attempt = Interlocked.Increment(ref attempts);
            if (attempt == 2)
            {
                secondAttempted.TrySetResult(true);
            }

            await gate.WaitAsync(cancellationToken);
            if (attempt == 1)
            {
                firstAcquired.TrySetResult(true);
                await firstMayContinue.Task.WaitAsync(cancellationToken);
            }
        }

        public void AllowFirstToContinue() => firstMayContinue.TrySetResult(true);

        public void Release() => gate.Release();
    }

    private sealed class ThrowingAuditWriter : IRegistrationAuditWriter
    {
        public Task WriteAsync(SystemContext context, AuditLog auditLog, CancellationToken cancellationToken = default) => throw new InvalidOperationException("audit failure");
    }

    private sealed class CapturingAuditWriter : IRegistrationAuditWriter
    {
        public List<AuditLog> Audits { get; } = [];
        public Task WriteAsync(SystemContext context, AuditLog auditLog, CancellationToken cancellationToken = default)
        {
            Audits.Add(auditLog);
            return Task.CompletedTask;
        }
    }
}
