using Blocks.SystemService.Configs;

namespace Blocks.SystemService.DTOs.CoreFeature.Registration.Dtos;

public sealed class RegistrationAvailabilityResponse
{
    public bool IsAvailable { get; set; }
}

public sealed class RegistrationSettingsResponse
{
    public string RegistrationMode { get; set; } = RegistrationModes.AdminProvisioned;
    public Guid? DefaultRegistrationRoleId { get; set; }
}

public sealed class RegistrationResponse
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Fullname { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
}
