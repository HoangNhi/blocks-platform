using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.Menu;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class MenuController : BaseController<MenuController>
    {
        private readonly IMenuService _service;

        public MenuController(IMenuService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetList(GetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelMenuGetListPaging>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelMenu> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] MenuRequest request)
        {
            var result = await _service.Insert(request);
            return Ok(new BaseResponse<ModelMenu> { Data = result, Success = true });
        }

        [HttpPut, Route("update")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(MenuRequest request)
        {
            var result = await _service.Update(request);
            return Ok(new BaseResponse<ModelMenu> { Data = result, Success = true });
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            var result = await _service.DeleteList(request);
            return Ok(new BaseResponse<string> { Data = result, Success = true });
        }

        [HttpGet, Route("get-list-by-user")]
        [AttributePermission(PermissionKey = "admin.permissions", Action = ActionType.NONE, SubjectIdQueryParameter = "id")]
        public async Task<IActionResult> GetListByUser([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetListByUser(request);
            return Ok(new BaseResponse<List<ModelMenuGetListPaging>> { Data = result, Success = true });
        }
    }
}
