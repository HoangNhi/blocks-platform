using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.SystemGroup;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SystemGroupController : BaseController<SystemGroupController>
    {
        private readonly ISystemGroupService _service;

        public SystemGroupController(ISystemGroupService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetList(GetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelSystemGroupGetListPaging>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelSystemGroup> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] SystemGroupRequest request)
        {
            var result = await _service.Insert(request);
            return Ok(new BaseResponse<ModelSystemGroup> { Data = result, Success = true });
        }

        [HttpPut, Route("update")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(SystemGroupRequest request)
        {
            var result = await _service.Update(request);
            return Ok(new BaseResponse<ModelSystemGroup> { Data = result, Success = true });
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            var result = await _service.DeleteList(request);
            return Ok(new BaseResponse<string> { Data = result, Success = true });
        }

        [HttpGet, Route("get-all-combobox")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.NONE)]
        public async Task<IActionResult> GetAllForCombobox()
        {
            var result = await _service.GetAllForCombobox();
            return Ok(new BaseResponse<List<ModelCombobox>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-all-not-parent-combobox")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.NONE)]
        public async Task<IActionResult> GetAllNotParentForCombobox()
        {
            var result = await _service.GetAllNotParentForCombobox();
            return Ok(new BaseResponse<List<ModelCombobox>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-all")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetAll()
        {
            var result = await _service.GetAll();
            return Ok(new BaseResponse<List<ModelSystemGroup>> { Data = result, Success = true });
        }
    }
}
