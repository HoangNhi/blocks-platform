using Blocks.SystemService.Entities;
using AutoDependencyRegistration.Attributes;
using Blocks.SystemService.Infrastructure.Data;
using AuditLogEntity = Blocks.SystemService.Entities.AuditLog;
using UserEntity = Blocks.SystemService.Entities.User;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Blocks.SystemService.Services.CoreFeature.Registration;

public sealed record WorkspaceProvisioningResult(Guid WorkspaceId);

[RegisterClassAsScoped]
public sealed class BootstrapAdvisoryLock(SystemContext context) : IBootstrapAdvisoryLock
{
    public const long LockKey = 42425254;
    public const string LockCommandText = "select pg_advisory_xact_lock($1);";

    public async Task AcquireAsync(CancellationToken cancellationToken = default)
    {
        if (context.Database.GetDbConnection() is not NpgsqlConnection connection)
        {
            return;
        }

        await using var command = new NpgsqlCommand(LockCommandText, connection, (NpgsqlTransaction?)context.Database.CurrentTransaction?.GetDbTransaction());
        command.Parameters.AddWithValue(LockKey);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}

public interface IRegistrationWorkspaceProvisioner
{
    Task<WorkspaceProvisioningResult> ProvisionAsync(SystemContext context, UserEntity user, string fullname, Invitation? invitation, CancellationToken cancellationToken = default);
}

public interface IRegistrationAuditWriter
{
    Task WriteAsync(SystemContext context, AuditLogEntity auditLog, CancellationToken cancellationToken = default);
}

[RegisterClassAsTransient]
public sealed class RegistrationWorkspaceProvisioner : IRegistrationWorkspaceProvisioner
{
    public Task<WorkspaceProvisioningResult> ProvisionAsync(SystemContext context, UserEntity user, string fullname, Invitation? invitation, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var personalWorkspace = new Workspace
        {
            Id = Guid.NewGuid(), Name = fullname, CreatedAt = now, CreatedBy = user.Username,
            IsActive = true, IsDeleted = false
        };
        context.Workspaces.Add(personalWorkspace);
        context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = Guid.NewGuid(), WorkspaceId = personalWorkspace.Id, UserId = user.Id, Role = "owner",
            CreatedAt = now, CreatedBy = user.Username, IsActive = true, IsDeleted = false
        });

        if (invitation?.TargetWorkspaceId is Guid targetWorkspaceId)
        {
            context.WorkspaceMembers.Add(new WorkspaceMember
            {
                Id = Guid.NewGuid(), WorkspaceId = targetWorkspaceId, UserId = user.Id, Role = "member",
                CreatedAt = now, CreatedBy = user.Username, IsActive = true, IsDeleted = false
            });
        }

        return Task.FromResult(new WorkspaceProvisioningResult(personalWorkspace.Id));
    }
}

[RegisterClassAsTransient]
public sealed class RegistrationAuditWriter : IRegistrationAuditWriter
{
    public Task WriteAsync(SystemContext context, AuditLogEntity auditLog, CancellationToken cancellationToken = default)
    {
        context.AuditLogs.Add(auditLog);
        return Task.CompletedTask;
    }
}
