namespace Blocks.SystemService.Services.CoreFeature.Registration;

internal static class RegistrationAuthorizationSafety
{
    public static bool IsSafePermissionKey(string? permissionKey)
    {
        return string.Equals(permissionKey, "workspace.home", StringComparison.OrdinalIgnoreCase);
    }
}
