using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Services.CoreFeature.User;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.SystemService.Helpers
{
    public class AttributePermission : Attribute, IAsyncAuthorizationFilter
    {
        public ActionType Action { get; set; }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            try
            {
                if (Action == ActionType.NONE)
                {
                    return;
                }

                var userIdClaim = context.HttpContext.User.Claims.FirstOrDefault(x => x.Type == "name")?.Value;
                if (!Guid.TryParse(userIdClaim, out var userId))
                {
                    throw new UnauthorizedAccessException();
                }

                var controllerName = ((Microsoft.AspNetCore.Mvc.Controllers.ControllerActionDescriptor)context.ActionDescriptor).ControllerName.ToLower();
                var userService = context.HttpContext.RequestServices.GetRequiredService<IUserService>();

                var response = await userService.CheckPermission(new DTOs.CoreFeature.User.Requests.CheckPermissionRequest
                {
                    UserId = userId,
                    Controller = controllerName,
                    Action = ((int)Action)
                });

                if (!response.HasPermission)
                {
                    context.Result = new ForbidResult();
                }
            }
            catch (UnauthorizedAccessException)
            {
                var response = new BaseResponse<string>
                {
                    Success = false,
                    StatusCode = 401,
                    Message = "Bạn chưa đăng nhập"
                };
                context.Result = new JsonResult(response);
            }
            catch (Exception)
            {
                var response = new BaseResponse<string>
                {
                    Success = false,
                    StatusCode = 500,
                    Message = "Đã xảy ra lỗi hệ thống khi kiểm tra quyền"
                };
                context.Result = new JsonResult(response);
            }
        }
    }
}
