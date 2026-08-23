using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Npgsql;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.CoreFeature.Role
{
    [RegisterClassAsTransient]
    public class RoleService : IRoleService
    {
        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly ISystemReferenceGuard _referenceGuard;

        public RoleService(
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

        public async Task<ModelRole> GetById(GetByIdRequest request)
        {
            var data = await _context.Roles.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            var result = _mapper.Map<ModelRole>(data);
            result.IsDefaultRegistrationRole = await IsDefaultRegistrationRoleAsync(data.Id);
            return result;
        }

        public async Task<ModelRole> Insert(RoleRequest request)
        {
            var key = NormalizeRoleKey(request.Key);
            await EnsureRegistrationEligibilityIsSafeAsync(null, key, request.IsRegistrationEligible);

            var data = _context.Roles.Where(x =>
                (x.Name == request.Name || x.Key.Trim().ToLower() == key)
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Tên gọi hoặc mã vai trò đã tồn tại");
            }

            var add = _mapper.Map<Entities.Role>(request);
            add.Key = key;
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            add.CreatedAt = DateTime.UtcNow;
            add.IsActived = true;

            await _context.Roles.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelRole>(add);
        }

        public async Task<ModelRole> Update(RoleRequest request)
        {
            var key = NormalizeRoleKey(request.Key);
            var data = _context.Roles.Where(x =>
                (x.Name == request.Name || x.Key.Trim().ToLower() == key)
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Tên gọi hoặc mã vai trò đã tồn tại");
            }

            var update = await _context.Roles.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            if ((update.IsSystem || IsProtectedRoleKey(update.Key))
                && !string.Equals(NormalizeRoleKey(update.Key), key, StringComparison.Ordinal))
            {
                throw new BusinessException("Không thể thay đổi mã vai trò hệ thống");
            }

            await EnsureRegistrationEligibilityIsSafeAsync(update, key, request.IsRegistrationEligible);
            if (!request.IsRegistrationEligible && await _context.InstanceSettings.AnyAsync(x =>
                    x.DefaultRegistrationRoleId == update.Id && x.IsActive && !x.IsDeleted))
            {
                throw new BusinessException("Không thể tắt vai trò đăng ký mặc định");
            }

            _mapper.Map(request, update);
            update.Key = key;

            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;
            _context.Roles.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelRole>(update);
        }

        private static string NormalizeRoleKey(string key)
        {
            var normalized = key.Trim();
            if (normalized.Length == 0)
            {
                throw new BusinessException("Mã vai trò không được để trống");
            }

            if (!string.Equals(key, normalized, StringComparison.Ordinal))
            {
                throw new BusinessException("Mã vai trò không được chứa khoảng trắng đầu hoặc cuối");
            }

            normalized = normalized.ToLowerInvariant();
            if (normalized.Length == 0)
            {
                throw new BusinessException("Mã vai trò không được để trống");
            }

            return normalized;
        }

        private async Task EnsureRegistrationEligibilityIsSafeAsync(Entities.Role? role, string key, bool isRegistrationEligible)
        {
            if (!isRegistrationEligible)
            {
                return;
            }

            if ((role?.IsSystem == true && !IsMemberRoleKey(key)) || IsPrivilegedRoleKey(key))
            {
                throw new BusinessException("Vai trò đặc quyền không thể được chọn cho đăng ký");
            }

            var roleId = role?.Id ?? Guid.Empty;
            var hasAdminPermission = await _context.Permissions
                .Where(permission => permission.RoleId == roleId)
                .Join(_context.Menus, permission => permission.MenuId, menu => menu.Id, (_, menu) => menu)
                .AnyAsync(menu => menu.PermissionKey.StartsWith("admin.") && !menu.IsDeleted && menu.IsActived);
            if (hasAdminPermission)
            {
                throw new BusinessException("Vai trò đặc quyền không thể được chọn cho đăng ký");
            }
        }

        private static bool IsProtectedRoleKey(string key) =>
            string.Equals(key.Trim(), "member", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key.Trim(), "administrator", StringComparison.OrdinalIgnoreCase);

        private static bool IsMemberRoleKey(string key) =>
            string.Equals(key, "member", StringComparison.OrdinalIgnoreCase);

        private static bool IsPrivilegedRoleKey(string key) =>
            string.Equals(key, "administrator", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "operator", StringComparison.OrdinalIgnoreCase);

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Roles.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                if (IsProtectedRoleKey(delete.Key))
                {
                    throw new BusinessException("Không thể xóa vai trò hệ thống");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                delete.UpdatedAt = DateTime.UtcNow;

                _context.Roles.Update(delete);
            }

            await _context.SaveChangesAsync();
            return string.Join(',', request.Ids);
        }

        public async Task<GetListPagingResponse<ModelRoleGetListPaging>> GetList(GetListPagingRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_textsearch", request.TextSearch),
                new NpgsqlParameter("i_pageindex", request.PageIndex - 1),
                new NpgsqlParameter("i_pagesize", request.PageSize),
            };

            var result = await _context.ExecuteFunction<GetListPagingResponse<ModelRoleGetListPaging>>("fn_role_getlistpaging", parameters);
            var roleIds = result.Data.Select(role => role.Id).ToList();
            if (roleIds.Count == 0)
            {
                return result;
            }

            var roleMetadata = await _context.Roles
                .AsNoTracking()
                .Where(role => roleIds.Contains(role.Id))
                .ToDictionaryAsync(role => role.Id);
            var defaultRoleId = await GetDefaultRegistrationRoleIdAsync();

            foreach (var role in result.Data)
            {
                if (!roleMetadata.TryGetValue(role.Id, out var metadata))
                {
                    continue;
                }

                role.Key = metadata.Key;
                role.IsSystem = metadata.IsSystem;
                role.IsRegistrationEligible = metadata.IsRegistrationEligible;
                role.IsDefaultRegistrationRole = metadata.Id == defaultRoleId;
            }

            return result;
        }

        private async Task<bool> IsDefaultRegistrationRoleAsync(Guid roleId)
        {
            return await GetDefaultRegistrationRoleIdAsync() == roleId;
        }

        private Task<Guid?> GetDefaultRegistrationRoleIdAsync()
        {
            return _context.InstanceSettings
                .AsNoTracking()
                .Where(setting => setting.IsActive && !setting.IsDeleted)
                .Select(setting => setting.DefaultRegistrationRoleId)
                .SingleOrDefaultAsync();
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var result = await _context.Roles.AsNoTracking().Where(x => !x.IsDeleted && x.IsActived)
            .Select(x => new ModelCombobox
            {
                Text = x.Name,
                Value = x.Id.ToString(),
            })
            .OrderBy(x => x.Text).ToListAsync();
            return result;
        }

        public async Task<List<ModelPermission>> GetPermissionsByRole(GetByIdRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_role_id", request.Id)
            };

            var result = await _context.ExecuteFunction<List<ModelPermission>>("fn_permission_getbyrole", parameters);
            return result;
        }

        public async Task<bool> UpdatePermissions(UpdatePermissionsRequest request)
        {
            var duplicateRows = request.Permissions
                .GroupBy(item => new { item.RoleId, item.MenuId })
                .Any(group => group.Count() > 1);
            if (duplicateRows)
            {
                throw new BusinessException("Không thể phân quyền trùng vai trò và menu");
            }

            foreach (var item in request.Permissions)
            {
                await _referenceGuard.EnsureRoleExistsAsync(item.RoleId);
                await _referenceGuard.EnsureMenuExistsAsync(item.MenuId);
                var menu = await _context.Menus.FindAsync(item.MenuId);
                if (menu == null)
                {
                    throw new BusinessException("Menu không tồn tại.");
                }

                if ((item.IsViewed && !menu.CanView)
                    || (item.IsAdded && !menu.CanAdd)
                    || (item.IsUpdated && !menu.CanUpdate)
                    || (item.IsDeleted && !menu.CanDelete)
                    || (item.IsApproved && !menu.CanApprove)
                    || (item.IsAnalyzed && !menu.CanAnalyze))
                {
                    throw new BusinessException("Không thể cấp hành động không được menu hỗ trợ");
                }

                var resultUpdate = item.Id == Guid.Empty
                    ? await _context.Permissions.SingleOrDefaultAsync(permission =>
                        permission.RoleId == item.RoleId && permission.MenuId == item.MenuId)
                    : await _context.Permissions.FindAsync(item.Id);
                if (resultUpdate == null)
                {
                    var add = _mapper.Map<Entities.Permission>(item);
                    _context.Add(add);
                }
                else
                {
                    if (resultUpdate.RoleId != item.RoleId || resultUpdate.MenuId != item.MenuId)
                    {
                        throw new BusinessException("Permission không khớp vai trò hoặc menu");
                    }

                    resultUpdate.IsViewed = item.IsViewed;
                    resultUpdate.IsAdded = item.IsAdded;
                    resultUpdate.IsUpdated = item.IsUpdated;
                    resultUpdate.IsDeleted = item.IsDeleted;
                    resultUpdate.IsApproved = item.IsApproved;
                    resultUpdate.IsAnalyzed = item.IsAnalyzed;
                    _context.Update(resultUpdate);
                }

                var roleUpdate = await _context.Roles.FindAsync(item.RoleId);
                if (roleUpdate == null)
                {
                    throw new BusinessException("Vai trò không tồn tại.");
                }

                roleUpdate.UpdatedAt = DateTime.UtcNow;
                roleUpdate.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                _context.Update(roleUpdate);
            }


            await _context.SaveChangesAsync();

            return true;
        }

        public async Task<List<ModelGetPermissionByUser>> GetPermissionsByUser(GetByIdRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_user_id", request.Id)
            };

            var result = await _context.ExecuteFunction<List<ModelGetPermissionByUser>>("fn_permission_getbyuser", parameters);
            return result;
        }
    }
}
