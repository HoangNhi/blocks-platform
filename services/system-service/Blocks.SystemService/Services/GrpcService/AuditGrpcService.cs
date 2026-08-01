using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Contracts.Grpc;
using Grpc.Core;

namespace Blocks.SystemService.Services.GrpcService;

public class AuditGrpcService : AuditProto.AuditProtoBase
{
    private readonly SystemContext _context;
    private readonly ISystemReferenceGuard _referenceGuard;
    private readonly ILogger<AuditGrpcService> _logger;

    public AuditGrpcService(SystemContext context, ISystemReferenceGuard referenceGuard, ILogger<AuditGrpcService> logger)
    {
        _context = context;
        _referenceGuard = referenceGuard;
        _logger = logger;
    }

    public override async Task<WriteAuditLogReply> WriteAuditLog(
        WriteAuditLogRequest request, ServerCallContext context)
    {
        try
        {
            Guid? resolvedUserId = null;
            if (Guid.TryParse(request.UserId, out var uid))
            {
                resolvedUserId = await _referenceGuard.TryResolveExistingUserIdAsync(uid);
            }

            if (!resolvedUserId.HasValue)
            {
                _logger.LogWarning(
                    "Skipping audit log from {ServiceName} because request user id '{UserId}' is invalid",
                    request.ServiceName,
                    request.UserId);

                return new WriteAuditLogReply { Success = true, Message = "Skipped audit log because user id was invalid." };
            }

            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                UserId = resolvedUserId.Value,
                UserName = request.UserName,
                Action = request.Action,
                EntityName = request.EntityName,
                EntityId = string.IsNullOrEmpty(request.EntityId) ? null : request.EntityId,
                OldValues = string.IsNullOrEmpty(request.OldValues) ? null : request.OldValues,
                NewValues = string.IsNullOrEmpty(request.NewValues) ? null : request.NewValues,
                IpAddress = request.IpAddress,
                ServiceName = request.ServiceName,
                IsSuccess = request.IsSuccess,
                ErrorMessage = string.IsNullOrEmpty(request.ErrorMessage) ? null : request.ErrorMessage,
                CreatedAt = DateTime.UtcNow
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();

            return new WriteAuditLogReply { Success = true, Message = "OK" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log from {ServiceName}", request.ServiceName);
            return new WriteAuditLogReply { Success = false, Message = ex.Message };
        }
    }
}
