using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;

namespace Blocks.SystemService.Services.CoreFeature.Role
{
    public interface IRoleService
    {
        Task<ModelRole> GetById(GetByIdRequest request);
        Task<ModelRole> Insert(RoleRequest request);
        Task<ModelRole> Update(RoleRequest request);
        Task<string> DeleteList(DeleteListRequest request);
        Task<GetListPagingResponse<ModelRoleGetListPaging>> GetList(GetListPagingRequest request);
        Task<List<ModelPermission>> GetPermissionsByRole(GetByIdRequest request);
        Task<bool> UpdatePermissions(UpdatePermissionsRequest request);
        Task<List<ModelCombobox>> GetAllForCombobox();
        Task<List<ModelGetPermissionByUser>> GetPermissionsByUser(GetByIdRequest request);
    }
}
