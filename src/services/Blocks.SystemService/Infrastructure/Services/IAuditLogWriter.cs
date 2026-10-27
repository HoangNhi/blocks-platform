using Blocks.SystemService.Entities;

namespace Blocks.SystemService.Infrastructure.Services;

public interface IAuditLogWriter
{
    Task WriteAsync(AuditLog auditLog);
}
