namespace Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos
{
    public class ModelPermission_Menu
    {
        public Guid Id { get; set; }

        public Guid RoleId { get; set; }

        public Guid MenuId { get; set; }

        public string? Name { get; set; }

        public bool IsViewed { get; set; } = false;

        public bool IsAdded { get; set; } = false;

        public bool IsUpdated { get; set; } = false;

        public bool IsDeleted { get; set; } = false;

        public bool IsApproved { get; set; } = false;

        public bool IsAnalyzed { get; set; } = false;

        public bool CanView { get; set; } = false;

        public bool CanAdd { get; set; } = false;

        public bool CanUpdate { get; set; } = false;

        public bool CanDelete { get; set; } = false;

        public bool CanApprove { get; set; } = false;

        public bool CanAnalyze { get; set; } = false;
    }
}
