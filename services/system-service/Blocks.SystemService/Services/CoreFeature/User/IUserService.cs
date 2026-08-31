using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;

namespace Blocks.SystemService.Services.CoreFeature.User
{
    public interface IUserService
    {
        Task<ModelUser> GetById(GetByIdRequest request);
        Task<List<ModelUser>> GetByIds(List<Guid> ids);
        Task<List<ModelUser>> GetByUsernames(List<string> usernames);
        Task<GetListPagingResponse<ModelUser>> GetByIdsPaged(
            List<Guid> ids,
            string? textSearch,
            int pageIndex,
            int pageSize);
        Task<ModelUser> Insert(UserRequest request);
        Task<ModelUser> Update(UserRequest request);
        Task<string> DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelUserGetListPaging>> GetList(UserGetListPagingRequest request);
        Task<CheckPermissionResponse> CheckPermission(CheckPermissionRequest request);
        Task<ModelUser> GetCurrentUser();
        Task<List<ModelCombobox>> GetAllForCombobox();
        Task<ModelUser> EditProfile(EditProfileRequest request);
        Task<ModelUser> ChangePassword(ChangePasswordRequest request);
    }
}
