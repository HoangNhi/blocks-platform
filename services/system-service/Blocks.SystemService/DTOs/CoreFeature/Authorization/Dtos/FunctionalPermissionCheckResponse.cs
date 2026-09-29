namespace Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;

public sealed class FunctionalPermissionCheckResponse
{
    public bool HasPermission { get; set; }
    public Guid? UserId { get; set; }
    public string? Username { get; set; }
    public Guid? WorkspaceId { get; set; }
}
