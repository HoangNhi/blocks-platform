using Blocks.Shared.Common;
using Blocks.Shared.Exceptions;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.AuditLog.Requests;
using Blocks.SystemService.Infrastructure.Data;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.CoreFeature.AuditLog;

[RegisterClassAsTransient]
public class AuditLogService : IAuditLogService
{
    private readonly SystemContext _context;
    private readonly IMapper _mapper;

    public AuditLogService(SystemContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<GetListPagingResponse<ModelAuditLog>> GetList(AuditLogGetListRequest request)
    {
        var query = _context.AuditLogs.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.TextSearch))
        {
            var search = request.TextSearch.ToLower();
            query = query.Where(x =>
                x.UserName.ToLower().Contains(search) ||
                x.EntityName.ToLower().Contains(search) ||
                (x.EntityId != null && x.EntityId.ToLower().Contains(search)) ||
                (x.ErrorMessage != null && x.ErrorMessage.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(request.Action))
            query = query.Where(x => x.Action == request.Action);

        if (!string.IsNullOrWhiteSpace(request.EntityName))
            query = query.Where(x => x.EntityName == request.EntityName);

        if (request.UserId.HasValue && request.UserId != Guid.Empty)
            query = query.Where(x => x.UserId == request.UserId);

        if (!string.IsNullOrWhiteSpace(request.ServiceName))
            query = query.Where(x => x.ServiceName == request.ServiceName);

        if (request.IsSuccess.HasValue)
            query = query.Where(x => x.IsSuccess == request.IsSuccess.Value);

        if (request.FromDate.HasValue)
        {
            var from = DateTime.SpecifyKind(request.FromDate.Value, DateTimeKind.Unspecified);
            query = query.Where(x => x.CreatedAt >= from);
        }

        if (request.ToDate.HasValue)
        {
            var to = DateTime.SpecifyKind(request.ToDate.Value, DateTimeKind.Unspecified).AddDays(1);
            query = query.Where(x => x.CreatedAt <= to);
        }

        query = query.OrderByDescending(x => x.CreatedAt);

        var totalRow = await query.CountAsync();

        var data = await query
            .Skip((request.PageIndex - 1) * request.PageSize)
            .Take(request.PageSize)
            .ProjectTo<ModelAuditLog>(_mapper.ConfigurationProvider)
            .ToListAsync();

        return new GetListPagingResponse<ModelAuditLog>
        {
            Data = data,
            TotalRow = totalRow,
            PageIndex = request.PageIndex,
            PageSize = request.PageSize
        };
    }

    public async Task<ModelAuditLog> GetById(GetByIdRequest request)
    {
        var data = await _context.AuditLogs.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.Id);

        if (data == null)
            throw new BusinessException("Không tìm thấy dữ liệu audit log");

        return _mapper.Map<ModelAuditLog>(data);
    }

    public async Task<List<string>> GetDistinctEntityNames()
    {
        return await _context.AuditLogs.AsNoTracking()
            .Select(x => x.EntityName).Distinct().OrderBy(x => x).ToListAsync();
    }

    public async Task<List<string>> GetDistinctActions()
    {
        return await _context.AuditLogs.AsNoTracking()
            .Select(x => x.Action).Distinct().OrderBy(x => x).ToListAsync();
    }
}
