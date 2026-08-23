using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Services.CoreFeature.AuditLog;
using Blocks.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuditLogController : BaseController<AuditLogController>
{
    private readonly IAuditLogService _service;

    public AuditLogController(IAuditLogService service)
    {
        _service = service;
    }

    [HttpPost, Route("get-list")]
    [AttributePermission(PermissionKey = "admin.audit", Action = ActionType.VIEW)]
    public async Task<IActionResult> GetList(AuditLogGetListRequest request)
    {
        var result = await _service.GetList(request);
        return Ok(new BaseResponse<GetListPagingResponse<ModelAuditLog>> { Data = result, Success = true });
    }

    [HttpGet, Route("get-by-id")]
    [AttributePermission(PermissionKey = "admin.audit", Action = ActionType.VIEW)]
    public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
    {
        var result = await _service.GetById(request);
        return Ok(new BaseResponse<ModelAuditLog> { Data = result, Success = true });
    }

    [HttpGet, Route("get-entity-names")]
    [AttributePermission(PermissionKey = "admin.audit", Action = ActionType.VIEW)]
    public async Task<IActionResult> GetEntityNames()
    {
        var result = await _service.GetDistinctEntityNames();
        return Ok(new BaseResponse<List<string>> { Data = result, Success = true });
    }

    [HttpGet, Route("get-actions")]
    [AttributePermission(PermissionKey = "admin.audit", Action = ActionType.VIEW)]
    public async Task<IActionResult> GetActions()
    {
        var result = await _service.GetDistinctActions();
        return Ok(new BaseResponse<List<string>> { Data = result, Success = true });
    }
}
