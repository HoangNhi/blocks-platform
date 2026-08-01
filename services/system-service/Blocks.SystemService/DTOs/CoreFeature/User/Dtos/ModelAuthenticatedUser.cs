namespace Blocks.SystemService.DTOs.CoreFeature.User.Dtos
{
    public class ModelAuthenticatedUser
    {
        public Guid Id { get; set; }

        public string Username { get; set; } = null!;

        public string Fullname { get; set; } = null!;

        public Guid RoleId { get; set; }

        public string? RoleName { get; set; }

        public string Email { get; set; } = null!;

        public string? Avatar { get; set; }

        public static ModelAuthenticatedUser FromModelUser(ModelUser user)
        {
            return new ModelAuthenticatedUser
            {
                Id = user.Id,
                Username = user.Username,
                Fullname = user.Fullname,
                RoleId = user.RoleId,
                RoleName = user.RoleName,
                Email = user.Email,
                Avatar = user.Avatar
            };
        }

        public static ModelAuthenticatedUser FromEntity(Blocks.SystemService.Entities.User user, string? roleName = null)
        {
            return new ModelAuthenticatedUser
            {
                Id = user.Id,
                Username = user.Username,
                Fullname = user.Fullname,
                RoleId = user.RoleId,
                RoleName = roleName,
                Email = user.Email,
                Avatar = user.Avatar
            };
        }
    }
}
