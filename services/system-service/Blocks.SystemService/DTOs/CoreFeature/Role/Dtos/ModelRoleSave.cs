namespace Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;

public sealed class ModelRoleSave : ModelRole
{
    public ModelRoleSaveScopes SavedScopes { get; set; } = new();
}

public sealed class ModelRoleSaveScopes
{
    public bool Details { get; set; }

    public bool Permissions { get; set; }
}
