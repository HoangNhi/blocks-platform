using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.Role.Dtos
{
    public class ModelRole : BaseModel
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = null!;

        public string Key { get; set; } = null!;

        public bool IsSystem { get; set; }

        public bool IsRegistrationEligible { get; set; }

        public bool IsDefaultRegistrationRole { get; set; }

        public bool IsProtected { get; set; }

        public bool CanDeactivate { get; set; }

        public string? DeactivationBlockedReason { get; set; }

        public bool CanChangeRegistrationEligibility { get; set; }

        public string? RegistrationEligibilityBlockedReason { get; set; }

        public bool CanDelete { get; set; }

        public string? DeleteBlockedReason { get; set; }
    }
}
