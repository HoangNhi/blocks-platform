using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Helpers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using System.Security.Claims;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public class PermissionFilterTests
{
    [Fact]
    public async Task OnAuthorizationAsync_returns_401_when_user_id_claim_is_missing()
    {
        var filter = new AttributePermission { Action = ActionType.VIEW };
        var context = CreateContext(Array.Empty<Claim>());

        await filter.OnAuthorizationAsync(context);

        var result = Assert.IsType<JsonResult>(context.Result);
        var response = Assert.IsType<BaseResponse<string>>(result.Value);
        Assert.False(response.Success);
        Assert.Equal(401, response.StatusCode);
    }

    [Fact]
    public async Task OnAuthorizationAsync_returns_401_when_user_id_claim_is_not_guid()
    {
        var filter = new AttributePermission { Action = ActionType.VIEW };
        var context = CreateContext(new[] { new Claim("name", "not-a-guid") });

        await filter.OnAuthorizationAsync(context);

        var result = Assert.IsType<JsonResult>(context.Result);
        var response = Assert.IsType<BaseResponse<string>>(result.Value);
        Assert.False(response.Success);
        Assert.Equal(401, response.StatusCode);
    }

    private static AuthorizationFilterContext CreateContext(IEnumerable<Claim> claims)
    {
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"))
        };

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ControllerActionDescriptor { ControllerName = "User" });

        return new AuthorizationFilterContext(actionContext, new List<IFilterMetadata>());
    }
}
