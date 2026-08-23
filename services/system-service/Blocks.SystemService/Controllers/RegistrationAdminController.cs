using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers;

[Route("api/[controller]")]
[ApiController]
public sealed class RegistrationAdminController : BaseController<RegistrationAdminController>
{
    private readonly RegistrationAdminService _service;

    public RegistrationAdminController(RegistrationAdminService service)
    {
        _service = service;
    }

    [HttpGet("settings")]
    [AttributePermission(PermissionKey = "admin.registration", Action = ActionType.VIEW)]
    public async Task<IActionResult> GetSettings()
    {
        var result = await _service.GetSettingsAsync(HttpContext.RequestAborted);
        return Ok(new BaseResponse<object> { Data = result, Success = true });
    }

    [HttpPut("settings")]
    [AttributePermission(PermissionKey = "admin.registration", Action = ActionType.UPDATE)]
    public async Task<IActionResult> UpdateSettings(RegistrationSettingsRequest request)
    {
        var actor = User.Identity?.Name ?? "System";
        var result = await _service.UpdateSettingsAsync(request, actor, HttpContext.RequestAborted);
        return Ok(new BaseResponse<object> { Data = result, Success = true });
    }

    [HttpPost("invitations")]
    [AttributePermission(PermissionKey = "admin.registration", Action = ActionType.ADD)]
    public async Task<IActionResult> CreateInvitation(InvitationCreateRequest request)
    {
        var actor = User.Identity?.Name ?? "System";
        var result = await _service.CreateInvitationAsync(request, actor, HttpContext.RequestAborted);
        return Ok(new BaseResponse<object> { Data = new { result.Invitation.Id, result.Invitation.ExpiresAt, Token = result.Token }, Success = true });
    }
}
