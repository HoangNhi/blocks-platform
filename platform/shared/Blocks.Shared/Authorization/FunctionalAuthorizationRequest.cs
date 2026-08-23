namespace Blocks.Shared.Authorization;

public sealed class FunctionalAuthorizationRequest
{
    public string PermissionKey { get; init; } = string.Empty;

    public FunctionalPermissionAction Action { get; init; }
}
