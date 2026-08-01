using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Dtos
{
    public class ModelUserGetListPaging : BaseModel
    {
        public Guid Id { get; set; }

        public string Username { get; set; } = string.Empty;

        public string Fullname { get; set; } = string.Empty;

        public Guid RoleId { get; set; }

        public string? RoleName { get; set; }

        public string? Role { get; set; }

        public string Email { get; set; } = string.Empty;

        public string? Avatar { get; set; }
    }
}
