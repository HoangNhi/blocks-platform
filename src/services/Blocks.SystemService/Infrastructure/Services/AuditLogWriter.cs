using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Infrastructure.Services;

public class AuditLogWriter : IAuditLogWriter
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditLogWriter> _logger;

    public AuditLogWriter(IServiceScopeFactory scopeFactory, ILogger<AuditLogWriter> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task WriteAsync(AuditLog auditLog)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<SystemContext>();
            var referenceGuard = scope.ServiceProvider.GetRequiredService<ISystemReferenceGuard>();

            var resolvedUserId = await referenceGuard.TryResolveExistingUserIdAsync(auditLog.UserId);
            if (!resolvedUserId.HasValue)
            {
                _logger.LogWarning(
                    "Skipping audit log for {Action} on {Entity} because user {UserId} is not a valid FK target",
                    auditLog.Action,
                    auditLog.EntityName,
                    auditLog.UserId);
                return;
            }

            auditLog.UserId = resolvedUserId.Value;
            context.AuditLogs.Add(auditLog);
            await context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for {Action} on {Entity}",
                auditLog.Action, auditLog.EntityName);
        }
    }
}
