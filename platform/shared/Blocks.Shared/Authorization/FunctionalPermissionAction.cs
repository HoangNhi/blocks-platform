using System.Text.Json.Serialization;

namespace Blocks.Shared.Authorization;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FunctionalPermissionAction
{
    NONE = 0,
    VIEW = 1,
    ADD = 2,
    UPDATE = 3,
    DELETE = 4,
    APPROVE = 5,
    ANALYZE = 6
}
