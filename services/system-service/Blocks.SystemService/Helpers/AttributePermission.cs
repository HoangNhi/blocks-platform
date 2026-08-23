using Blocks.Shared.Authorization;
using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.SystemService.Helpers
{
    public class AttributePermission : Attribute, IAsyncAuthorizationFilter
    {
        public string? PermissionKey { get; set; }
        public string? SubjectIdQueryParameter { get; set; }
        public ActionType Action { get; set; }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            try
            {
                var userIdClaim = context.HttpContext.User.Claims.FirstOrDefault(x => x.Type == "name")?.Value;
                if (!Guid.TryParse(userIdClaim, out var userId))
                {
                    throw new UnauthorizedAccessException();
                }

                var descriptor = (Microsoft.AspNetCore.Mvc.Controllers.ControllerActionDescriptor)context.ActionDescriptor;
                var controllerName = descriptor.ControllerName.ToLowerInvariant();
                var authorizationService = context.HttpContext.RequestServices.GetRequiredService<IFunctionalAuthorizationService>();
                if (Action == ActionType.NONE)
                {
                    var subjectParameter = SubjectIdQueryParameter ??
                        (controllerName is "user" or "menu"
                            || controllerName == "role" && descriptor.ActionName == "GetPermissionsByUser"
                            ? "id"
                            : null);
                    if (subjectParameter != null
                        && context.HttpContext.Request.Query.TryGetValue(subjectParameter, out var subjectValues))
                    {
                        var subjectIds = subjectValues.ToString()
                            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                        if (subjectIds.Length == 0 || subjectIds.Any(value => !Guid.TryParse(value, out _)))
                        {
                            context.Result = new ForbidResult();
                            return;
                        }

                        var requestsOtherSubject = subjectIds
                            .Select(Guid.Parse)
                            .Any(requestedId => requestedId != userId);
                        if (!requestsOtherSubject)
                        {
                            return;
                        }

                        var hasSubjectPermission = await authorizationService.CheckAsync(
                            userId,
                            string.IsNullOrWhiteSpace(PermissionKey) ? null : PermissionKey,
                            FunctionalPermissionAction.VIEW,
                            string.IsNullOrWhiteSpace(PermissionKey) ? controllerName : null,
                            context.HttpContext.RequestAborted);
                        if (!hasSubjectPermission)
                        {
                            context.Result = new ForbidResult();
                        }
                    }

                    if (context.Result is null && !string.IsNullOrWhiteSpace(PermissionKey))
                    {
                        var hasExplicitPermission = await authorizationService.CheckAsync(
                            userId,
                            PermissionKey,
                            FunctionalPermissionAction.VIEW,
                            cancellationToken: context.HttpContext.RequestAborted);

                        if (!hasExplicitPermission)
                        {
                            context.Result = new ForbidResult();
                        }
                    }

                    return;
                }

                var hasPermission = await authorizationService.CheckAsync(
                    userId,
                    string.IsNullOrWhiteSpace(PermissionKey) ? null : PermissionKey,
                    (FunctionalPermissionAction)Action,
                    string.IsNullOrWhiteSpace(PermissionKey) ? controllerName : null,
                    context.HttpContext.RequestAborted);

                if (!hasPermission)
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
                context.Result = new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
            }
        }
    }
}
