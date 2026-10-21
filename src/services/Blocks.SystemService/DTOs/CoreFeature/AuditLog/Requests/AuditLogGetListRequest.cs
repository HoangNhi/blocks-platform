using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.AuditLog.Requests;

public class AuditLogGetListRequest : GetListPagingRequest
{
    public string? Action { get; set; }
    public string? EntityName { get; set; }
    public Guid? UserId { get; set; }
    public string? ServiceName { get; set; }
    public bool? IsSuccess { get; set; } // null = all, true = success, false = failures
}
