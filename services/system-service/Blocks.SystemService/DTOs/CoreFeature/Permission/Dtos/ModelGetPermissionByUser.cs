namespace Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos
{
    public class ModelGetPermissionByUser
    {
        public string Controller { get; set; } = null!;

        public bool IsViewed { get; set; } = false;

        public bool IsAdded { get; set; } = false;

        public bool IsUpdated { get; set; } = false;

        public bool IsDeleted { get; set; } = false;

        public bool IsApproved { get; set; } = false;

        public bool IsAnalyzed { get; set; } = false;

    }
}
