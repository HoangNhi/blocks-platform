using AutoMapper;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Dtos;

namespace Blocks.SystemService.Services.CoreFeature.AuditLog;

public class AuditLogProfile : Profile
{
    public AuditLogProfile()
    {
        CreateMap<Entities.AuditLog, ModelAuditLog>();
    }
}
