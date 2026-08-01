namespace Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos
{
    public class ModelPermission
    {
        public string SystemGroup { get; set; } = string.Empty;
        public List<ModelPermission_Menu> Roles { get; set; } = new List<ModelPermission_Menu>();

    }
}
