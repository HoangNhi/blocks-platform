using Blocks.Shared.DTOs.Base;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.SystemService.Controllers;

public sealed class AuthorizationRequestValidationFilter : IAsyncActionFilter, IOrderedFilter
{
    public int Order => -3000;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!context.ModelState.IsValid)
        {
            context.Result = new BadRequestObjectResult(new BaseResponse<string>
            {
                Success = false,
                StatusCode = 400,
                Message = "Yêu cầu không hợp lệ"
            });
            return;
        }

        await next();
    }
}
