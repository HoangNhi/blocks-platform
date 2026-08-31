using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.User;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UserController : BaseController<UserController>
    {
        private readonly IUserService _service;

        public UserController(IUserService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetList(UserGetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelUserGetListPaging>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.VIEW)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelUser> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] UserRequest request)
        {
            var result = await _service.Insert(request);
            return Ok(new BaseResponse<ModelUser> { Data = result, Success = true });
        }

        [HttpPut, Route("update")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(UserRequest request)
        {
            var result = await _service.Update(request);
            return Ok(new BaseResponse<ModelUser> { Data = result, Success = true });
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            var result = await _service.DeleteList(request);
            return Ok(new BaseResponse<string> { Data = result, Success = true });
        }

        [HttpGet, Route("get-current-user")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetCurrentUser()
        {
            var result = await _service.GetCurrentUser();
            return Ok(new BaseResponse<ModelAuthenticatedUser> { Data = ModelAuthenticatedUser.FromModelUser(result), Success = true });
        }

        [HttpGet, Route("get-all-combobox")]
        [AttributePermission(PermissionKey = "admin.users", Action = ActionType.NONE)]
        public async Task<IActionResult> GetAllForCombobox()
        {
            var result = await _service.GetAllForCombobox();
            return Ok(new BaseResponse<List<ModelCombobox>> { Data = result, Success = true });
        }

        [HttpPut("edit-profile")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> EditProfile(EditProfileRequest request)
        {
            var result = await _service.EditProfile(request);
            return Ok(new BaseResponse<ModelUser> { Data = result, Success = true });
        }

        [HttpPut("change-password")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
        {
            var result = await _service.ChangePassword(request);
            return Ok(new BaseResponse<ModelUser> { Data = result, Success = true });
        }
    }
}
