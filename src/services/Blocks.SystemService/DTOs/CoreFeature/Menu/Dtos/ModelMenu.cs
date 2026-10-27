using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.Menu.Dtos
{
    public class ModelMenu : BaseModel
    {
        public Guid Id { get; set; }

        public string Controller { get; set; } = null!;

        public string Name { get; set; } = null!;

        public Guid SystemGroupId { get; set; }

        public new int Sort { get; set; }

        public bool CanView { get; set; }

        public bool CanAdd { get; set; }

        public bool CanUpdate { get; set; }

        public bool CanDelete { get; set; }

        public bool CanApprove { get; set; }

        public bool CanAnalyze { get; set; }
        public bool IsShowMenu { get; set; }
    }
}
