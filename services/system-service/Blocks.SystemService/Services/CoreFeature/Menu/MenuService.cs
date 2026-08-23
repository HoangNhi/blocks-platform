using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Menu.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Blocks.SystemService.Services.CoreFeature.Menu
{
    [RegisterClassAsTransient]
    public class MenuService : IMenuService
    {
        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly ISystemReferenceGuard _referenceGuard;

        public MenuService(
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

        public async Task<ModelMenu> GetById(GetByIdRequest request)
        {
            var data = await _context.Menus.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelMenu>(data);
        }

        public async Task<ModelMenu> Insert(MenuRequest request)
        {
            var data = _context.Menus.Where(x =>
                (x.Name == request.Name && x.SystemGroupId == request.SystemGroupId
                    || x.PermissionKey == request.PermissionKey)
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Tên menu hoặc mã quyền đã tồn tại");
            }

            var add = _mapper.Map<Entities.Menu>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            await _referenceGuard.EnsureSystemGroupExistsAsync(
                add.SystemGroupId,
                "Nhóm hệ thống không tồn tại.");
            add.Controller = add.Controller.ToLower();
            add.CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            add.CreatedAt = DateTime.UtcNow;

            await _context.Menus.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelMenu>(add);
        }

        public async Task<ModelMenu> Update(MenuRequest request)
        {
            var data = _context.Menus.Where(x =>
                (x.Name == request.Name && x.SystemGroupId == request.SystemGroupId
                    || x.PermissionKey == request.PermissionKey)
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Tên menu hoặc mã quyền đã tồn tại");
            }

            var update = await _context.Menus.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            await _referenceGuard.EnsureSystemGroupExistsAsync(
                request.SystemGroupId,
                "Nhóm hệ thống không tồn tại.");
            _mapper.Map(request, update);

            update.Controller = update.Controller.ToLower();
            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;
            _context.Menus.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelMenu>(update);
        }

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Menus.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                delete.UpdatedAt = DateTime.UtcNow;

                _context.Menus.Update(delete);
            }

            await _context.SaveChangesAsync();
            return string.Join(',', request.Ids);
        }

        public async Task<GetListPagingResponse<ModelMenuGetListPaging>> GetList(GetListPagingRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_textsearch", request.TextSearch),
                new NpgsqlParameter("i_pageindex", request.PageIndex - 1),
                new NpgsqlParameter("i_pagesize", request.PageSize),
            };

            var result = await _context.ExecuteFunction<GetListPagingResponse<ModelMenuGetListPaging>>("fn_menu_getlistpaging", parameters);
            return result;
        }

        public async Task<List<ModelMenuGetListPaging>> GetListByUser(GetByIdRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_user_id", request.Id),
            };

            var result = await _context.ExecuteFunction<List<ModelMenuGetListPaging>>("fn_menu_getbyuser", parameters);
            var menuIds = result.Select(menu => menu.Id).ToList();
            if (menuIds.Count == 0)
            {
                return result;
            }

            var permissionKeys = await _context.Menus
                .AsNoTracking()
                .Where(menu => menuIds.Contains(menu.Id))
                .ToDictionaryAsync(menu => menu.Id, menu => menu.PermissionKey);

            foreach (var menu in result)
            {
                if (permissionKeys.TryGetValue(menu.Id, out var permissionKey))
                {
                    menu.PermissionKey = permissionKey;
                }
            }

            return result;
        }
    }
}
