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
    }
}
