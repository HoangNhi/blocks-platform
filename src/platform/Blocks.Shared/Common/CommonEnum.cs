namespace Blocks.Shared.Common
{
    /// <summary>
    /// Permission action types, shared across all services that check user permissions.
    /// </summary>
    public enum ActionType
    {
        NONE     = 0, // No permission check
        VIEW     = 1, // GetById, GetList
        ADD      = 2, // Insert, Import
        UPDATE   = 3, // Update
        DELETE   = 4, // DeleteList
        APPROVE  = 5, // Approve, Reject
        ANALYZE  = 6  // Export
    }
}
