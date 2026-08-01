using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Requests;

namespace Blocks.SystemService.Services.CoreFeature.AuditLog;

public interface IAuditLogService
{
    Task<GetListPagingResponse<ModelAuditLog>> GetList(AuditLogGetListRequest request);
    Task<ModelAuditLog> GetById(GetByIdRequest request);
    Task<List<string>> GetDistinctEntityNames();
    Task<List<string>> GetDistinctActions();
}
