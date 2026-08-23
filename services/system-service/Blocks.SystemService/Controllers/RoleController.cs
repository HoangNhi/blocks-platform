using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.Role;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RoleController : BaseController<RoleController>
    {
        private readonly IRoleService _service;

        public RoleController(IRoleService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetList(GetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelRoleGetListPaging>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelRole> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] RoleRequest request)
        {
            var result = await _service.Insert(request);
            return Ok(new BaseResponse<ModelRole> { Data = result, Success = true });
        }

        [HttpPut, Route("update")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(RoleRequest request)
        {
            var result = await _service.Update(request);
            return Ok(new BaseResponse<ModelRole> { Data = result, Success = true });
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            var result = await _service.DeleteList(request);
            return Ok(new BaseResponse<string> { Data = result, Success = true });
        }

        [HttpGet, Route("get-all-combobox")]
        [AttributePermission(PermissionKey = "admin.roles", Action = ActionType.NONE)]
        public async Task<IActionResult> GetAllForCombobox()
        {
            var result = await _service.GetAllForCombobox();
            return Ok(new BaseResponse<List<ModelCombobox>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-permissions-by-role")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetPermissionsByRole([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetPermissionsByRole(request);
            return Ok(new BaseResponse<List<ModelPermission>> { Data = result, Success = true });
        }

        [HttpPut, Route("update-permissions")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.UPDATE)]
        public async Task<IActionResult> UpdatePermissions(UpdatePermissionsRequest request)
        {
            var result = await _service.UpdatePermissions(request);
            return Ok(new BaseResponse<bool> { Data = result, Success = true });
        }

        [HttpGet, Route("get-permissions-by-user")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.NONE, SubjectIdQueryParameter = "id")]
        public async Task<IActionResult> GetPermissionsByUser([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetPermissionsByUser(request);
            return Ok(new BaseResponse<List<ModelGetPermissionByUser>> { Data = result, Success = true });
        }
    }
}
