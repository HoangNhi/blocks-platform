namespace Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;

public sealed class RegistrationSettingsRequest
{
    public string RegistrationMode { get; set; } = string.Empty;
    public Guid? DefaultRegistrationRoleId { get; set; }
}

public sealed class InvitationCreateRequest
{
    public DateTime ExpiresAt { get; set; }
    public Guid? TargetWorkspaceId { get; set; }
    public Guid? RegistrationRoleId { get; set; }
}
