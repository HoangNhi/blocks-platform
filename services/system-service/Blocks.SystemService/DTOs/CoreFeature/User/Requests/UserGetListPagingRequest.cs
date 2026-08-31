using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.DTOs.CoreFeature.User.Requests;

public class UserGetListPagingRequest : GetListPagingRequest
{
    public Guid? RoleId { get; set; }

    public bool? IsActived { get; set; }
}
