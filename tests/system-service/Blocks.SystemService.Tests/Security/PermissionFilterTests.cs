using Blocks.Shared.Authorization;
using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public class PermissionFilterTests
{
    [Fact]
    public async Task AuthorizationController_rejects_unknown_action()
    {
        var controller = new AuthorizationController(new StubFunctionalAuthorizationService(true));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", Guid.NewGuid().ToString())
                }, "test"))
            }
        };

        var result = await controller.Check(new FunctionalPermissionCheckRequest
        {
            PermissionKey = "admin.users",
            Action = (FunctionalPermissionAction)999
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<BaseResponse<string>>(badRequest.Value);
        Assert.Equal(400, response.StatusCode);
    }

    [Fact]
    public void AuthorizationController_requires_jwt_authorization()
    {
        var attribute = typeof(AuthorizationController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .Single();

        Assert.Equal(JwtBearerDefaults.AuthenticationScheme, attribute.AuthenticationSchemes);
    }

    [Fact]
    public async Task AuthorizationController_returns_503_when_authority_fails()
    {
        var controller = new AuthorizationController(new ThrowingFunctionalAuthorizationService());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", Guid.NewGuid().ToString())
                }, "test"))
            }
        };

        var result = await controller.Check(new FunctionalPermissionCheckRequest
        {
            PermissionKey = "admin.users",
            Action = FunctionalPermissionAction.VIEW
        });

        var unavailable = Assert.IsType<StatusCodeResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
    }

    [Fact]
    public async Task AuthorizationController_returns_denied_result_when_grant_is_missing()
    {
        var controller = new AuthorizationController(new StubFunctionalAuthorizationService(false));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", Guid.NewGuid().ToString())
                }, "test"))
            }
        };

        var result = await controller.Check(new FunctionalPermissionCheckRequest
        {
            PermissionKey = "admin.users",
            Action = FunctionalPermissionAction.VIEW
        });

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<BaseResponse<FunctionalPermissionCheckResponse>>(ok.Value);
        Assert.False(response.Data!.HasPermission);
    }

    [Fact]
    public async Task AuthorizationController_returns_401_for_invalid_identity_claim()
    {
        var controller = new AuthorizationController(new StubFunctionalAuthorizationService(true));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", "invalid")
                }, "test"))
            }
        };

        var result = await controller.Check(new FunctionalPermissionCheckRequest
        {
            PermissionKey = "admin.users",
            Action = FunctionalPermissionAction.VIEW
        });

        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result);
        var response = Assert.IsType<BaseResponse<string>>(unauthorized.Value);
        Assert.Equal(401, response.StatusCode);
    }

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

    [Fact]
    public async Task OnAuthorizationAsync_keeps_none_as_authentication_only()
    {
        var filter = new AttributePermission { Action = ActionType.NONE };
        var context = CreateContext(new[] { new Claim("name", Guid.NewGuid().ToString()) });

        await filter.OnAuthorizationAsync(context);

        Assert.Null(context.Result);
    }

    [Fact]
    public async Task OnAuthorizationAsync_checks_permission_for_none_action_when_key_is_present()
    {
        var userId = Guid.NewGuid();
        var service = new StubFunctionalAuthorizationService(false);
        var filter = new AttributePermission { PermissionKey = "admin.users", Action = ActionType.NONE };
        var context = CreateContext(new[] { new Claim("name", userId.ToString()) }, service);

        await filter.OnAuthorizationAsync(context);

        Assert.IsType<ForbidResult>(context.Result);
        Assert.Equal((userId, "admin.users", FunctionalPermissionAction.VIEW, null), service.LastCall);
    }

    [Fact]
    public async Task OnAuthorizationAsync_denies_none_action_for_another_user_query_id()
    {
        var userId = Guid.NewGuid();
        var filter = new AttributePermission { Action = ActionType.NONE };
        var context = CreateContext(new[] { new Claim("name", userId.ToString()) });
        context.HttpContext.Request.QueryString = new QueryString($"?Id={Guid.NewGuid()}");

        await filter.OnAuthorizationAsync(context);

        Assert.IsType<ForbidResult>(context.Result);
    }

    [Fact]
    public void UserController_combobox_does_not_allow_anonymous_access()
    {
        var method = typeof(UserController).GetMethod(nameof(UserController.GetAllForCombobox));

        Assert.Empty(method!.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true));
    }

    [Fact]
    public void SystemGroup_navigation_metadata_requires_authentication_only()
    {
        var method = typeof(SystemGroupController).GetMethod(nameof(SystemGroupController.GetAll));
        var attribute = method!.GetCustomAttributes(typeof(AttributePermission), inherit: true)
            .Cast<AttributePermission>()
            .Single();

        Assert.Equal(ActionType.NONE, attribute.Action);
        Assert.Null(attribute.PermissionKey);
    }

    [Fact]
    public void RoleController_marks_user_permission_query_with_subject_guard()
    {
        var method = typeof(RoleController).GetMethod(nameof(RoleController.GetPermissionsByUser));
        var attribute = method!.GetCustomAttributes(typeof(AttributePermission), inherit: true)
            .Cast<AttributePermission>()
            .Single();

        Assert.Equal(ActionType.NONE, attribute.Action);
        Assert.Equal("id", attribute.SubjectIdQueryParameter);
    }

    [Fact]
    public async Task OnAuthorizationAsync_denies_role_permission_query_for_another_user()
    {
        var userId = Guid.NewGuid();
        var filter = new AttributePermission { Action = ActionType.NONE };
        var context = CreateContext(
            new[] { new Claim("name", userId.ToString()) },
            actionName: "GetPermissionsByUser",
            controllerName: "Role");
        context.HttpContext.Request.QueryString = new QueryString($"?Id={Guid.NewGuid()}");

        await filter.OnAuthorizationAsync(context);

        Assert.IsType<ForbidResult>(context.Result);
    }

    [Fact]
    public async Task AuthorizationController_model_binding_filter_returns_bad_request_for_unknown_action_string()
    {
        var filter = new AuthorizationRequestValidationFilter();
        var httpContext = new DefaultHttpContext();
        var actionContext = new ActionContext(httpContext, new RouteData(), new ControllerActionDescriptor());
        var context = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            new AuthorizationController(new StubFunctionalAuthorizationService(true)));
        context.ModelState.AddModelError("Action", "The JSON value could not be converted.");

        await filter.OnActionExecutionAsync(context, () => throw new InvalidOperationException());

        var badRequest = Assert.IsType<BadRequestObjectResult>(context.Result);
        var response = Assert.IsType<BaseResponse<string>>(badRequest.Value);
        Assert.Equal(400, badRequest.StatusCode);
        Assert.Equal(400, response.StatusCode);
    }

    [Fact]
    public async Task OnAuthorizationAsync_falls_back_to_controller_when_permission_key_is_missing()
    {
        var userId = Guid.NewGuid();
        var service = new StubFunctionalAuthorizationService(true);
        var filter = new AttributePermission { Action = ActionType.VIEW };
        var context = CreateContext(new[] { new Claim("name", userId.ToString()) }, service);

        await filter.OnAuthorizationAsync(context);

        Assert.Null(context.Result);
        Assert.Equal((userId, null, FunctionalPermissionAction.VIEW, "user"), service.LastCall);
    }

    [Fact]
    public async Task OnAuthorizationAsync_uses_explicit_permission_key()
    {
        var userId = Guid.NewGuid();
        var service = new StubFunctionalAuthorizationService(true);
        var filter = new AttributePermission
        {
            PermissionKey = "admin.users",
            Action = ActionType.VIEW
        };
        var context = CreateContext(new[] { new Claim("name", userId.ToString()) }, service);

        await filter.OnAuthorizationAsync(context);

        Assert.Null(context.Result);
        Assert.Equal((userId, "admin.users", FunctionalPermissionAction.VIEW, null), service.LastCall);
    }

    private static AuthorizationFilterContext CreateContext(
        IEnumerable<Claim> claims,
        IFunctionalAuthorizationService? authorizationService = null,
        string controllerName = "User",
        string actionName = "Action")
    {
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")),
            RequestServices = new ServiceCollection()
                .AddSingleton(authorizationService ?? new StubFunctionalAuthorizationService(false))
                .BuildServiceProvider()
        };

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ControllerActionDescriptor
            {
                ControllerName = controllerName,
                ActionName = actionName
            });

        return new AuthorizationFilterContext(actionContext, new List<IFilterMetadata>());
    }

    private sealed class ThrowingFunctionalAuthorizationService : IFunctionalAuthorizationService
    {
        public Task<bool> CheckAsync(Guid userId, string? permissionKey, FunctionalPermissionAction action, string? controller = null, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("authority unavailable");
    }

    private sealed class StubFunctionalAuthorizationService : IFunctionalAuthorizationService
    {
        private readonly bool _result;

        public StubFunctionalAuthorizationService(bool result)
        {
            _result = result;
        }

        public (Guid UserId, string? PermissionKey, FunctionalPermissionAction Action, string? Controller)? LastCall { get; private set; }

        public Task<bool> CheckAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            string? controller = null,
            CancellationToken cancellationToken = default)
        {
            LastCall = (userId, permissionKey, action, controller);
            return Task.FromResult(_result);
        }
    }
}
