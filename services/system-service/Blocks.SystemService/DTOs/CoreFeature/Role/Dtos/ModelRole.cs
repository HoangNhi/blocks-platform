using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.Role.Dtos
{
    public class ModelRole : BaseModel
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = null!;
    }
}
