using Blocks.Shared.Authorization;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Authorization.Requests;
using Blocks.SystemService.Services.CoreFeature.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers;

[Route("api/[controller]")]
[ApiController]
[TypeFilter(typeof(AuthorizationRequestValidationFilter))]
public sealed class AuthorizationController : BaseController<AuthorizationController>
{
    private readonly IFunctionalAuthorizationService _authorizationService;

    public AuthorizationController(IFunctionalAuthorizationService authorizationService)
    {
        _authorizationService = authorizationService;
    }

    [HttpPost("check")]
    public async Task<IActionResult> Check(FunctionalPermissionCheckRequest request)
    {
        if (!Enum.IsDefined(request.Action) || request.Action == FunctionalPermissionAction.NONE)
        {
            return BadRequest(new BaseResponse<string>
            {
                Success = false,
                StatusCode = 400,
                Message = "Hành động không được hỗ trợ"
            });
        }

        if (string.IsNullOrWhiteSpace(request.PermissionKey))
        {
            return BadRequest(new BaseResponse<string>
            {
                Success = false,
                StatusCode = 400,
                Message = "PermissionKey không được để trống"
            });
        }

        var userIdClaim = User.Claims.FirstOrDefault(claim => claim.Type == "name")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new BaseResponse<string>
            {
                Success = false,
                StatusCode = 401,
                Message = "Bạn chưa đăng nhập"
            });
        }

        ScopedAuthorizationResult result;
        try
        {
            result = await _authorizationService.CheckScopedAsync(
                userId,
                request.PermissionKey,
                request.Action,
                request.WorkspaceId,
                cancellationToken: HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        return Ok(new BaseResponse<FunctionalPermissionCheckResponse>
        {
            Data = new FunctionalPermissionCheckResponse
            {
                HasPermission = result.HasPermission,
                UserId = result.UserId,
                Username = result.Username,
                WorkspaceId = result.WorkspaceId
            },
            Success = true
        });
    }

    [HttpGet("workspaces")]
    public async Task<IActionResult> GetWorkspaces()
    {
        var userIdClaim = User.Claims.FirstOrDefault(claim => claim.Type == "name")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new BaseResponse<string>
            {
                Success = false,
                StatusCode = 401,
                Message = "Bạn chưa đăng nhập"
            });
        }

        List<WorkspaceAccessDto> workspaces;
        try
        {
            workspaces = await _authorizationService.GetUserWorkspacesAsync(userId, HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        return Ok(new BaseResponse<List<WorkspaceAccessDto>>
        {
            Data = workspaces,
            Success = true
        });
    }
}
