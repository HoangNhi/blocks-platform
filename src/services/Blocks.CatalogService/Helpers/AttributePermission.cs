using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Common;
using Blocks.SystemService.Protos;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.CatalogService.Helpers
{
    public class AttributePermission : Attribute, IAsyncAuthorizationFilter
    {
        public ActionType Action { get; set; }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            try
            {
                if (Action == ActionType.NONE) return;

                // 1. Get UserID from Claims
                var userId = context.HttpContext.User.Claims.FirstOrDefault(x => x.Type == "name")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    throw new UnauthorizedAccessException();
                }

                var controllerName = ((Microsoft.AspNetCore.Mvc.Controllers.ControllerActionDescriptor)context.ActionDescriptor).ControllerName.ToLower();

                // 2. Resolve Client from DI
                var client = context.HttpContext.RequestServices.GetRequiredService<SystemProto.SystemProtoClient>();

                // 3. Call gRPC
                var response = await client.CheckPermissionAsync(new CheckPermissionRequest
                {
                    UserId = userId,
                    Controller = controllerName,
                    Action = ((int)Action)
                });

                if (!response.Success)
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
            catch (Grpc.Core.RpcException)
            {
                var response = new BaseResponse<string>
                {
                    Success = false,
                    StatusCode = 503,
                    Message = "Dịch vụ xác thực quyền đang bảo trì"
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
