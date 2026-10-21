using Blocks.Shared.DTOs.Base;

namespace Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Dtos
{
    public class ModelStakeholder : BaseModel
    {
        public Guid Id { get; set; }

        public string FullName { get; set; } = null!;

        public string Email { get; set; } = null!;

        /// <summary>
        /// 1. Sinh viên, 2. Cựu sinh viên, 3. Nhà tuyển dụng
        /// </summary>
        public int Type { get; set; }

        public string? Description { get; set; }
    }
}
