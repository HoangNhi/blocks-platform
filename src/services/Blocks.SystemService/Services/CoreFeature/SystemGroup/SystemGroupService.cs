using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.SystemGroup.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Blocks.SystemService.Services.CoreFeature.SystemGroup
{
    [RegisterClassAsTransient]
    public class SystemGroupService : ISystemGroupService
    {
        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly ISystemReferenceGuard _referenceGuard;

        public SystemGroupService(
            SystemContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor,
            ISystemReferenceGuard referenceGuard)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
            _referenceGuard = referenceGuard;
        }

        public async Task<ModelSystemGroup> GetById(GetByIdRequest request)
        {
            var data = await _context.SystemGroups.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelSystemGroup>(data);
        }

        public async Task<ModelSystemGroup> Insert(SystemGroupRequest request)
        {
            var data = _context.SystemGroups.Where(x =>
                x.Name == request.Name
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Tên nhóm đã tồn tại");
            }

            var add = _mapper.Map<Entities.SystemGroup>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            if (add.ParentId.HasValue)
            {
                if (add.ParentId.Value == add.Id)
                {
                    throw new BusinessException("Nhóm cha không hợp lệ");
                }

                await _referenceGuard.EnsureSystemGroupExistsAsync(
                    add.ParentId.Value,
                    "Nhóm cha không tồn tại.");
            }

            add.CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            add.CreatedAt = DateTime.UtcNow;

            await _context.SystemGroups.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelSystemGroup>(add);
        }

        public async Task<ModelSystemGroup> Update(SystemGroupRequest request)
        {
            var data = _context.SystemGroups.Where(x =>
                x.Name == request.Name
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Tên nhóm đã tồn tại");
            }

            var update = await _context.SystemGroups.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            if (request.Parentid.HasValue)
            {
                if (request.Parentid.Value == update.Id)
                {
                    throw new BusinessException("Nhóm cha không hợp lệ");
                }

                await _referenceGuard.EnsureSystemGroupExistsAsync(
                    request.Parentid.Value,
                    "Nhóm cha không tồn tại.");
            }
            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;
            _context.SystemGroups.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelSystemGroup>(update);
        }

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.SystemGroups.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                delete.UpdatedAt = DateTime.UtcNow;

                _context.SystemGroups.Update(delete);
            }

            await _context.SaveChangesAsync();
            return string.Join(',', request.Ids);
        }

        public async Task<GetListPagingResponse<ModelSystemGroupGetListPaging>> GetList(GetListPagingRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_textsearch", request.TextSearch),
                new NpgsqlParameter("i_pageindex", request.PageIndex == -1 ? -1 : request.PageIndex - 1),
                new NpgsqlParameter("i_pagesize", request.PageSize),
            };

            var result = await _context.ExecuteFunction<GetListPagingResponse<ModelSystemGroupGetListPaging>>("fn_system_group_getlistpaging", parameters);
            return result;
        }

        public async Task<List<ModelSystemGroup>> GetAll()
        {
            var data = await _context.SystemGroups.AsNoTracking().Where(x => !x.IsDeleted && x.IsActived).ToListAsync();
            var result = _mapper.Map<List<ModelSystemGroup>>(data).OrderBy(x => x.Sort).ToList();
            return result;
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.SystemGroups.AsNoTracking().Where(x => !x.IsDeleted && x.IsActived).ToListAsync();
            var result = data.Select(x => new ModelCombobox
            {
                Text = x.Name,
                Value = x.Id.ToString(),
                Parent = x.ParentId.HasValue ? data.FirstOrDefault(y => y.Id == x.ParentId)?.Name : ""
            })
            .OrderBy(x => x.Sort).ToList();
            return result;
        }

        public async Task<List<ModelCombobox>> GetAllNotParentForCombobox()
        {
            var data = await _context.SystemGroups.AsNoTracking().Where(x => !x.IsDeleted && x.IsActived && !x.ParentId.HasValue).ToListAsync();
            var result = data.Select(x => new ModelCombobox
            {
                Text = x.Name,
                Value = x.Id.ToString(),
                Parent = x.ParentId.HasValue ? data.FirstOrDefault(y => y.Id == x.ParentId)?.Name : ""
            })
            .OrderBy(x => x.Sort).ToList();
            return result;
        }
    }
}
