using Blocks.Shared.Authorization;

namespace Blocks.SystemService.DTOs.CoreFeature.Authorization.Requests;

public sealed class WorkloadPermissionCheckRequest
{
    public Guid UserId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string PermissionKey { get; set; } = string.Empty;
    public FunctionalPermissionAction Action { get; set; }
}
