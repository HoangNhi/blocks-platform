namespace Blocks.Shared.Authorization;

public sealed class FunctionalAuthorizationResult
{
    public bool Allowed { get; init; }

    public bool AuthorityAvailable { get; init; }

    public bool Authenticated { get; init; }

    public static FunctionalAuthorizationResult Allow() => new()
    {
        Allowed = true,
        AuthorityAvailable = true,
        Authenticated = true
    };

    public static FunctionalAuthorizationResult Deny() => new()
    {
        Allowed = false,
        AuthorityAvailable = true,
        Authenticated = true
    };

    public static FunctionalAuthorizationResult Unauthenticated() => new()
    {
        Allowed = false,
        AuthorityAvailable = true,
        Authenticated = false
    };

    public static FunctionalAuthorizationResult Unavailable() => new()
    {
        Allowed = false,
        AuthorityAvailable = false,
        Authenticated = true
    };
}
