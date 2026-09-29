using System.Security.Claims;
using Blocks.Shared.Authorization;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Requests;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Blocks.SystemService.Tests.Security;

public sealed class AuthorizationControllerHttpTests
{
    [Fact]
    public async Task Check_with_workspace_id_returns_scoped_proof()
    {
        var userId = Guid.NewGuid();
        var workspaceId = Guid.NewGuid();
        var mockService = new StubScopedAuthorizationService(
            new ScopedAuthorizationResult(true, userId, "alice", workspaceId));

        var controller = CreateControllerWithUser(mockService, userId);

        var request = new FunctionalPermissionCheckRequest
        {
            PermissionKey = "tradelab.strategies",
            Action = FunctionalPermissionAction.VIEW,
            WorkspaceId = workspaceId
        };

        var actionResult = await controller.Check(request);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var response = Assert.IsType<BaseResponse<FunctionalPermissionCheckResponse>>(okResult.Value);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.HasPermission);
        Assert.Equal(userId, response.Data.UserId);
        Assert.Equal("alice", response.Data.Username);
        Assert.Equal(workspaceId, response.Data.WorkspaceId);
    }

    [Fact]
    public async Task GetWorkspaces_returns_workspaces_for_authenticated_user()
    {
        var userId = Guid.NewGuid();
        var ws1 = new WorkspaceAccessDto { Id = Guid.NewGuid(), Name = "Workspace 1" };
        var ws2 = new WorkspaceAccessDto { Id = Guid.NewGuid(), Name = "Workspace 2" };
        var mockService = new StubScopedAuthorizationService(
            new ScopedAuthorizationResult(true),
            new List<WorkspaceAccessDto> { ws1, ws2 });

        var controller = CreateControllerWithUser(mockService, userId);

        var actionResult = await controller.GetWorkspaces();
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var response = Assert.IsType<BaseResponse<List<WorkspaceAccessDto>>>(okResult.Value);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(2, response.Data.Count);
        Assert.Equal(ws1.Id, response.Data[0].Id);
    }

    [Fact]
    public async Task GetWorkspaces_unauthenticated_returns_unauthorized()
    {
        var mockService = new StubScopedAuthorizationService(new ScopedAuthorizationResult(false));
        var controller = new AuthorizationController(mockService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };

        var actionResult = await controller.GetWorkspaces();
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(actionResult);
        var response = Assert.IsType<BaseResponse<string>>(unauthorizedResult.Value);
        Assert.False(response.Success);
        Assert.Equal(401, response.StatusCode);
    }

    private static AuthorizationController CreateControllerWithUser(
        IFunctionalAuthorizationService service,
        Guid userId)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            new[]
            {
                new Claim("name", userId.ToString()),
                new Claim("unique_name", "testuser")
            },
            "TestAuth"));

        return new AuthorizationController(service)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = httpContext
            }
        };
    }

    private sealed class StubScopedAuthorizationService : IFunctionalAuthorizationService
    {
        private readonly ScopedAuthorizationResult _result;
        private readonly List<WorkspaceAccessDto> _workspaces;

        public StubScopedAuthorizationService(
            ScopedAuthorizationResult result,
            List<WorkspaceAccessDto>? workspaces = null)
        {
            _result = result;
            _workspaces = workspaces ?? new List<WorkspaceAccessDto>();
        }

        public Task<bool> CheckAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            string? controller = null,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_result.HasPermission);
        }

        public Task<ScopedAuthorizationResult> CheckScopedAsync(
            Guid userId,
            string? permissionKey,
            FunctionalPermissionAction action,
            Guid? workspaceId,
            string? controller = null,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_result);
        }

        public Task<List<WorkspaceAccessDto>> GetUserWorkspacesAsync(
            Guid userId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_workspaces);
        }
    }
}
