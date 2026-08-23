namespace Blocks.SystemService.Configs;

public sealed class RegistrationOptions
{
    public const string SectionName = "Registration";
    public const string RegistrationPolicy = "registration";
    public const string BootstrapPolicy = "bootstrap";
    public const string Open = RegistrationModes.Open;
    public const string InviteOnly = RegistrationModes.InviteOnly;
    public const string AdminProvisioned = RegistrationModes.AdminProvisioned;
    public string? Secret { get; set; }
    public int RegistrationPermitLimit { get; set; } = 5;
    public int RegistrationWindowMinutes { get; set; } = 1;
    public int BootstrapPermitLimit { get; set; } = 3;
    public int BootstrapWindowMinutes { get; set; } = 1;
}

public static class RegistrationModes
{
    public const string Open = "open";
    public const string InviteOnly = "invite_only";
    public const string AdminProvisioned = "admin_provisioned";
}
