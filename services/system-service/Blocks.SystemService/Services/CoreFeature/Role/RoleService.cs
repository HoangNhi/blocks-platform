using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Authorization;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Permission.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Role.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Role.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Blocks.SystemService.Services.CoreFeature.Authorization;
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
        private readonly IFunctionalAuthorizationService? _functionalAuthorizationService;

        public RoleService(
            SystemContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor,
            ISystemReferenceGuard referenceGuard,
            IFunctionalAuthorizationService? functionalAuthorizationService = null)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
            _referenceGuard = referenceGuard;
            _functionalAuthorizationService = functionalAuthorizationService;
        }

        private readonly record struct PermissionValues(
            bool IsViewed,
            bool IsAdded,
            bool IsUpdated,
            bool IsDeleted,
            bool IsApproved,
            bool IsAnalyzed)
        {
            public bool HasGrant => IsViewed || IsAdded || IsUpdated || IsDeleted || IsApproved || IsAnalyzed;

            public static PermissionValues From(Entities.Permission permission) => new(
                permission.IsViewed,
                permission.IsAdded,
                permission.IsUpdated,
                permission.IsDeleted,
                permission.IsApproved,
                permission.IsAnalyzed);

            public static PermissionValues From(PermissionRequest permission) => new(
                permission.IsViewed,
                permission.IsAdded,
                permission.IsUpdated,
                permission.IsDeleted,
                permission.IsApproved,
                permission.IsAnalyzed);
        }

        public async Task<ModelRole> GetById(GetByIdRequest request)
        {
            var data = await _context.Roles.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            var result = _mapper.Map<ModelRole>(data);
            await ApplyRoleRestrictionMetadataAsync(new List<ModelRole> { result });
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

            var transaction = _context.Database.IsRelational()
                ? await _context.Database.BeginTransactionAsync()
                : null;
            try
            {
                await _context.Roles.AddAsync(add);
                await SyncRegistrationRoleAsync(add.Id, add.IsRegistrationEligible);
                await _context.SaveChangesAsync();
                if (transaction is not null)
                {
                    await transaction.CommitAsync();
                }

                return _mapper.Map<ModelRole>(add);
            }
            catch
            {
                if (transaction is not null)
                {
                    await transaction.RollbackAsync();
                }

                throw;
            }
            finally
            {
                if (transaction is not null)
                {
                    await transaction.DisposeAsync();
                }
            }
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

            if (!request.IsActived && (update.IsSystem || IsProtectedRoleKey(update.Key)))
            {
                throw new BusinessException("Khong the vo hieu hoa vai tro he thong");
            }

            if (IsProtectedRoleKey(key) && !IsProtectedRoleKey(update.Key))
            {
                throw new BusinessException("Khong the dung ma vai tro bao ve");
            }

            await EnsureRegistrationEligibilityIsSafeAsync(update, key, request.IsRegistrationEligible);
            var transaction = _context.Database.IsRelational()
                ? await _context.Database.BeginTransactionAsync()
                : null;
            try
            {
                _mapper.Map(request, update);
                update.Key = key;

                await SyncRegistrationRoleAsync(update.Id, update.IsRegistrationEligible);
                update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                update.UpdatedAt = DateTime.UtcNow;
                _context.Roles.Update(update);
                await _context.SaveChangesAsync();
                if (transaction is not null)
                {
                    await transaction.CommitAsync();
                }

                return _mapper.Map<ModelRole>(update);
            }
            catch
            {
                if (transaction is not null)
                {
                    await transaction.RollbackAsync();
                }

                throw;
            }
            finally
            {
                if (transaction is not null)
                {
                    await transaction.DisposeAsync();
                }
            }
        }

        public async Task<ModelRoleSave> Save(RoleSaveRequest request)
        {
            var hasDetailsScope = request.Details is not null;
            var permissionRequests = request.Permissions ?? [];
            var hasPermissionsScope = permissionRequests.Count > 0;

            if (request.Id == Guid.Empty)
            {
                throw new BusinessException("Vai tro khong hop le");
            }

            if (!hasDetailsScope && !hasPermissionsScope)
            {
                throw new BusinessException("Phai co thay doi vai tro hoac phan quyen");
            }

            await EnsureSaveAuthorizationAsync(hasDetailsScope, hasPermissionsScope);

            var transaction = _context.Database.IsRelational()
                ? await _context.Database.BeginTransactionAsync()
                : null;

            try
            {
                var role = await _context.Roles.SingleOrDefaultAsync(item => item.Id == request.Id && !item.IsDeleted);
                var isNew = role is null;
                var wasRegistrationEligible = role?.IsRegistrationEligible;

                if (isNew && !hasDetailsScope)
                {
                    throw new BusinessException("Khong the cap nhat phan quyen cho vai tro chua ton tai");
                }

                var details = request.Details;
                var finalName = role?.Name ?? details!.Name.Trim();
                var finalKey = role?.Key ?? NormalizeRoleKey(details!.Key);
                var finalRegistrationEligible = role?.IsRegistrationEligible ?? details!.IsRegistrationEligible;
                var finalIsActived = role?.IsActived ?? details!.IsActived;
                var detailsChanged = isNew;

                if (details is not null)
                {
                    finalName = details.Name.Trim();
                    finalKey = NormalizeRoleKey(details.Key);

                    if (string.IsNullOrWhiteSpace(finalName))
                    {
                        throw new BusinessException("Ten vai tro khong duoc de trong");
                    }

                    if (await _context.Roles.AnyAsync(item =>
                        item.Id != request.Id
                        && !item.IsDeleted
                        && (item.Name == finalName || item.Key.ToLower() == finalKey)))
                    {
                        throw new BusinessException("Ten goi hoac ma vai tro da ton tai");
                    }

                    if (role is not null)
                    {
                        if ((role.IsSystem || IsProtectedRoleKey(role.Key))
                            && !string.Equals(role.Key.Trim(), finalKey, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new BusinessException("Khong the thay doi ma vai tro he thong");
                        }

                        detailsChanged = role.Name != finalName
                            || !string.Equals(role.Key, finalKey, StringComparison.Ordinal)
                            || role.IsRegistrationEligible != details.IsRegistrationEligible
                            || role.IsActived != details.IsActived;
                    }

                    finalRegistrationEligible = details.IsRegistrationEligible;
                    finalIsActived = details.IsActived;
                }

                if (role is null)
                {
                    role = new Entities.Role
                    {
                        Id = request.Id,
                        Name = finalName,
                        Key = finalKey,
                        IsSystem = false,
                        IsRegistrationEligible = finalRegistrationEligible,
                        IsActived = finalIsActived,
                        IsDeleted = false,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System",
                    };
                }

                var registrationEligibilityChanged = isNew
                    || details is not null && wasRegistrationEligible != finalRegistrationEligible;

                var existingPermissions = await _context.Permissions
                    .Where(permission => permission.RoleId == role.Id)
                    .ToListAsync();
                var existingById = existingPermissions.ToDictionary(permission => permission.Id);
                var existingByMenu = existingPermissions.ToDictionary(permission => permission.MenuId);
                var finalPermissions = existingPermissions.ToDictionary(
                    permission => permission.MenuId,
                    PermissionValues.From);
                var permissionOperations = new List<(PermissionRequest Request, Entities.Permission? Existing, PermissionValues Values)>();
                var permissionsChanged = false;

                if (hasPermissionsScope)
                {
                    if (permissionRequests.GroupBy(permission => permission.MenuId).Any(group => group.Count() > 1))
                    {
                        throw new BusinessException("Khong the phan quyen trung menu");
                    }

                    var menuIds = permissionRequests.Select(permission => permission.MenuId).Distinct().ToList();
                    var menus = await _context.Menus
                        .Where(menu => menuIds.Contains(menu.Id) && !menu.IsDeleted)
                        .ToDictionaryAsync(menu => menu.Id);
                    if (menus.Count != menuIds.Count)
                    {
                        throw new BusinessException("Menu khong ton tai");
                    }

                    foreach (var permissionRequest in permissionRequests)
                    {
                        if (permissionRequest.RoleId != role.Id)
                        {
                            throw new BusinessException("Permission khong khop vai tro");
                        }

                        var menu = menus[permissionRequest.MenuId];
                        if ((permissionRequest.IsViewed && !menu.CanView)
                            || (permissionRequest.IsAdded && !menu.CanAdd)
                            || (permissionRequest.IsUpdated && !menu.CanUpdate)
                            || (permissionRequest.IsDeleted && !menu.CanDelete)
                            || (permissionRequest.IsApproved && !menu.CanApprove)
                            || (permissionRequest.IsAnalyzed && !menu.CanAnalyze))
                        {
                            throw new BusinessException("Khong the cap hanh dong khong duoc menu ho tro");
                        }

                        Entities.Permission? existing = null;
                        if (permissionRequest.Id != Guid.Empty)
                        {
                            if (!existingById.TryGetValue(permissionRequest.Id, out existing)
                                || existing.RoleId != role.Id
                                || existing.MenuId != permissionRequest.MenuId)
                            {
                                throw new BusinessException("Permission khong khop vai tro hoac menu");
                            }
                        }
                        else
                        {
                            existingByMenu.TryGetValue(permissionRequest.MenuId, out existing);
                        }

                        var values = PermissionValues.From(permissionRequest);
                        finalPermissions[permissionRequest.MenuId] = values;
                        if (existing is null)
                        {
                            permissionsChanged |= values.HasGrant;
                        }
                        else
                        {
                            permissionsChanged |= PermissionValues.From(existing) != values;
                        }

                        permissionOperations.Add((permissionRequest, existing, values));
                    }
                }

                await EnsureFinalStateIsSafeAsync(role, finalKey, finalRegistrationEligible, finalIsActived, finalPermissions);

                if (isNew)
                {
                    _context.Roles.Add(role);
                }
                else if (details is not null)
                {
                    role.Name = finalName;
                    role.Key = finalKey;
                    role.IsRegistrationEligible = finalRegistrationEligible;
                    role.IsActived = finalIsActived;
                }

                if (registrationEligibilityChanged)
                {
                    await SyncRegistrationRoleAsync(role.Id, finalRegistrationEligible);
                }

                foreach (var operation in permissionOperations)
                {
                    if (operation.Existing is null)
                    {
                        if (!operation.Values.HasGrant)
                        {
                            continue;
                        }

                        _context.Permissions.Add(new Entities.Permission
                        {
                            Id = operation.Request.Id == Guid.Empty ? Guid.NewGuid() : operation.Request.Id,
                            RoleId = role.Id,
                            MenuId = operation.Request.MenuId,
                            IsViewed = operation.Values.IsViewed,
                            IsAdded = operation.Values.IsAdded,
                            IsUpdated = operation.Values.IsUpdated,
                            IsDeleted = operation.Values.IsDeleted,
                            IsApproved = operation.Values.IsApproved,
                            IsAnalyzed = operation.Values.IsAnalyzed,
                        });
                    }
                    else
                    {
                        operation.Existing.IsViewed = operation.Values.IsViewed;
                        operation.Existing.IsAdded = operation.Values.IsAdded;
                        operation.Existing.IsUpdated = operation.Values.IsUpdated;
                        operation.Existing.IsDeleted = operation.Values.IsDeleted;
                        operation.Existing.IsApproved = operation.Values.IsApproved;
                        operation.Existing.IsAnalyzed = operation.Values.IsAnalyzed;
                    }
                }

                if (detailsChanged || permissionsChanged)
                {
                    role.UpdatedAt = DateTime.UtcNow;
                    role.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                    _context.Roles.Update(role);
                }

                await _context.SaveChangesAsync();
                if (transaction is not null)
                {
                    await transaction.CommitAsync();
                }

                var result = _mapper.Map<ModelRoleSave>(role);
                await ApplyRoleRestrictionMetadataAsync(new List<ModelRole> { result });
                result.SavedScopes = new ModelRoleSaveScopes
                {
                    Details = detailsChanged,
                    Permissions = permissionsChanged,
                };
                return result;
            }
            catch
            {
                if (transaction is not null)
                {
                    await transaction.RollbackAsync();
                }

                throw;
            }
            finally
            {
                if (transaction is not null)
                {
                    await transaction.DisposeAsync();
                }
            }
        }

        private async Task EnsureSaveAuthorizationAsync(bool detailsScope, bool permissionsScope)
        {
            var userIdValue = _contextAccessor.HttpContext?.User?.Claims
                .FirstOrDefault(claim => claim.Type == "name")?.Value;
            if (!Guid.TryParse(userIdValue, out var userId))
            {
                throw new BusinessException("Ban chua dang nhap", 401);
            }

            if (_functionalAuthorizationService is null)
            {
                throw new BusinessException("Khong the xac thuc quyen", 403);
            }

            var hasRolePermission = !detailsScope || await CheckAuthorizationAsync(userId, "admin.roles");
            var hasPermissionPermission = !permissionsScope || await CheckAuthorizationAsync(userId, "admin.permissions");
            if (!hasRolePermission || !hasPermissionPermission)
            {
                throw new BusinessException("Ban khong co quyen cap nhat vai tro hoac phan quyen", 403);
            }
        }

        private async Task<bool> CheckAuthorizationAsync(Guid userId, string permissionKey)
        {
            try
            {
                return await _functionalAuthorizationService!.CheckAsync(
                    userId,
                    permissionKey,
                    FunctionalPermissionAction.UPDATE,
                    cancellationToken: _contextAccessor.HttpContext?.RequestAborted ?? CancellationToken.None);
            }
            catch
            {
                return false;
            }
        }

        private async Task EnsureFinalStateIsSafeAsync(
            Entities.Role role,
            string finalKey,
            bool finalRegistrationEligible,
            bool finalIsActived,
            Dictionary<Guid, PermissionValues> finalPermissions)
        {
            var defaultRoleId = await GetDefaultRegistrationRoleIdAsync();
            var isProtected = role.IsSystem || IsProtectedRoleKey(role.Key);
            var isPrivileged = IsPrivilegedRoleKey(finalKey) || (role.IsSystem && !IsMemberRoleKey(finalKey));

            if (!finalIsActived && (isProtected || role.Id == defaultRoleId))
            {
                throw new BusinessException("Khong the vo hieu hoa vai tro he thong hoac mac dinh");
            }

            if (finalRegistrationEligible && isPrivileged)
            {
                throw new BusinessException("Vai tro dac quyen khong the duoc chon cho dang ky");
            }

            if (!finalRegistrationEligible || finalPermissions.Count == 0)
            {
                return;
            }

            var menuIds = finalPermissions.Keys.ToList();
            var menus = await _context.Menus
                .AsNoTracking()
                .Where(menu => menuIds.Contains(menu.Id) && !menu.IsDeleted && menu.IsActived)
                .ToDictionaryAsync(menu => menu.Id);
            if (finalPermissions.Any(item => item.Value.HasGrant
                && menus.TryGetValue(item.Key, out var menu)
                && !RegistrationAuthorizationSafety.IsSafePermissionKey(menu.PermissionKey)))
            {
                throw new BusinessException("Vai tro dang ky khong duoc cap quyen khong an toan");
            }
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
                throw new BusinessException("Vai tro dac quyen khong the duoc chon cho dang ky");
            }

            var roleId = role?.Id ?? Guid.Empty;
            var hasUnsafePermission = await _context.Permissions
                .Where(permission => permission.RoleId == roleId
                    && (permission.IsViewed
                        || permission.IsAdded
                        || permission.IsUpdated
                        || permission.IsDeleted
                        || permission.IsApproved
                        || permission.IsAnalyzed))
                .Join(_context.Menus, permission => permission.MenuId, menu => menu.Id, (_, menu) => menu)
                .AnyAsync(menu => !menu.IsDeleted
                    && menu.IsActived
                    && !RegistrationAuthorizationSafety.IsSafePermissionKey(menu.PermissionKey));
            if (hasUnsafePermission)
            {
                throw new BusinessException("Vai tro dang ky khong duoc cap quyen khong an toan");
            }
        }

        private static bool IsProtectedRoleKey(string key) =>
            string.Equals(key.Trim(), "member", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key.Trim(), "administrator", StringComparison.OrdinalIgnoreCase);

        private static bool IsMemberRoleKey(string key) =>
            string.Equals(key, "member", StringComparison.OrdinalIgnoreCase);

        private static bool IsPrivilegedRoleKey(string key) =>
            string.Equals(key, "administrator", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "operator", StringComparison.OrdinalIgnoreCase)
            || key.Trim().StartsWith("admin.", StringComparison.OrdinalIgnoreCase);

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            var roleIds = request.Ids.Distinct().ToList();
            var roles = await _context.Roles
                .Where(role => roleIds.Contains(role.Id) && !role.IsDeleted)
                .ToListAsync();
            if (roles.Count != roleIds.Count)
            {
                throw new BusinessException("Du lieu khong ton tai");
            }

            var defaultRoleId = await GetDefaultRegistrationRoleIdAsync();
            var assignedRoleIds = await _context.Users
                .Where(user => roleIds.Contains(user.RoleId) && !user.IsDeleted)
                .Select(user => user.RoleId)
                .Distinct()
                .ToListAsync();
            var assignedRoleIdSet = assignedRoleIds.ToHashSet();

            foreach (var role in roles)
            {
                if (role.IsSystem || IsProtectedRoleKey(role.Key))
                {
                    throw new BusinessException("Khong the xoa vai tro he thong");
                }

                if (role.Id == defaultRoleId)
                {
                    throw new BusinessException("Khong the xoa vai tro dang ky mac dinh");
                }

                if (assignedRoleIdSet.Contains(role.Id))
                {
                    throw new BusinessException("Khong the xoa vai tro dang duoc gan cho nguoi dung");
                }
            }

            foreach (var role in roles)
            {
                role.IsDeleted = true;
                role.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                role.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            return string.Join(',', roleIds);
        }


        public async Task<GetListPagingResponse<ModelRoleGetListPaging>> GetList(GetListPagingRequest request)
        {
            var roleRequest = request as RoleGetListPagingRequest;
            var safePageIndex = roleRequest is null
                ? Math.Max(1, request.PageIndex)
                : request.PageIndex;
            var safePageSize = roleRequest is null
                ? Math.Clamp(request.PageSize <= 0 ? 10 : request.PageSize, 1, 100)
                : request.PageSize;

            if (safePageIndex < 1 || safePageSize is < 1 or > 100)
            {
                throw new BusinessException("Tham so phan trang khong hop le");
            }

            var query = _context.Roles
                .AsNoTracking()
                .Where(role => !role.IsDeleted);

            if (!string.IsNullOrWhiteSpace(request.TextSearch))
            {
                var search = request.TextSearch.Trim().ToLower();
                query = query.Where(role =>
                    role.Name.ToLower().Contains(search)
                    || role.Key.ToLower().Contains(search));
            }

            if (roleRequest?.IsActived is bool isActived)
            {
                query = query.Where(role => role.IsActived == isActived);
            }

            if (roleRequest?.IsSystem is bool isSystem)
            {
                query = query.Where(role => role.IsSystem == isSystem);
            }

            if (roleRequest?.IsRegistrationEligible is bool isRegistrationEligible)
            {
                query = query.Where(role => role.IsRegistrationEligible == isRegistrationEligible);
            }

            var totalRow = await query.CountAsync();
            var entities = await query
                .OrderBy(role => role.Name)
                .ThenBy(role => role.Id)
                .Skip((safePageIndex - 1) * safePageSize)
                .Take(safePageSize)
                .ToListAsync();
            var models = entities.Select(_mapper.Map<ModelRoleGetListPaging>).ToList();
            await ApplyRoleRestrictionMetadataAsync(models.Cast<ModelRole>().ToList());

            return new GetListPagingResponse<ModelRoleGetListPaging>
            {
                PageIndex = safePageIndex,
                PageSize = safePageSize,
                TotalRow = totalRow,
                Data = models,
            };
        }

        private async Task ApplyRoleRestrictionMetadataAsync(List<ModelRole> roles)
        {
            if (roles.Count == 0)
            {
                return;
            }

            var roleIds = roles.Select(role => role.Id).ToList();
            var defaultRoleId = await GetDefaultRegistrationRoleIdAsync();
            var assignedRoleIds = await _context.Users
                .AsNoTracking()
                .Where(user => roleIds.Contains(user.RoleId) && !user.IsDeleted)
                .Select(user => user.RoleId)
                .Distinct()
                .ToListAsync();
            var assignedRoleIdSet = assignedRoleIds.ToHashSet();

            foreach (var role in roles)
            {
                var isProtected = role.IsSystem || IsProtectedRoleKey(role.Key);
                var isDefault = role.Id == defaultRoleId;
                var isPrivileged = IsPrivilegedRoleKey(role.Key) || (role.IsSystem && !IsMemberRoleKey(role.Key));
                var hasAssignedUsers = assignedRoleIdSet.Contains(role.Id);

                role.IsProtected = isProtected;
                role.IsDefaultRegistrationRole = isDefault;
                role.CanDeactivate = !isProtected && !isDefault;
                role.DeactivationBlockedReason = isProtected
                    ? "Vai trò hệ thống hoặc bảo vệ không thể vô hiệu hóa"
                    : isDefault
                        ? "Vai trò đăng ký mặc định không thể vô hiệu hóa"
                        : null;
                role.CanChangeRegistrationEligibility = !isPrivileged;
                role.RegistrationEligibilityBlockedReason = isPrivileged
                    ? "Vai trò đặc quyền không thể được chọn cho đăng ký"
                    : null;
                role.CanDelete = !isProtected && !isDefault && !hasAssignedUsers;
                role.DeleteBlockedReason = isProtected
                    ? "Vai trò hệ thống hoặc bảo vệ không thể xóa"
                    : isDefault
                        ? "Vai trò đăng ký mặc định không thể xóa"
                        : hasAssignedUsers
                            ? "Vai trò đang được gán cho người dùng"
                            : null;
            }
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

        private async Task SyncRegistrationRoleAsync(Guid roleId, bool isRegistrationEligible)
        {
            var actor = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            var now = DateTime.UtcNow;
            var setting = await _context.InstanceSettings
                .SingleOrDefaultAsync(item => item.IsActive && !item.IsDeleted);

            if (!isRegistrationEligible)
            {
                if (setting?.DefaultRegistrationRoleId == roleId)
                {
                    setting.DefaultRegistrationRoleId = null;
                    setting.UpdatedAt = now;
                    setting.UpdatedBy = actor;
                }

                return;
            }

            var otherEligibleRoles = await _context.Roles
                .Where(item => item.Id != roleId && item.IsRegistrationEligible && !item.IsDeleted)
                .ToListAsync();
            foreach (var otherRole in otherEligibleRoles)
            {
                otherRole.IsRegistrationEligible = false;
                otherRole.UpdatedAt = now;
                otherRole.UpdatedBy = actor;
            }

            if (setting is null)
            {
                setting = new Entities.InstanceSetting
                {
                    Id = Guid.NewGuid(),
                    RegistrationMode = RegistrationModes.AdminProvisioned,
                    CreatedAt = now,
                    CreatedBy = actor,
                    IsActive = true,
                    IsDeleted = false,
                };
                _context.InstanceSettings.Add(setting);
            }

            setting.DefaultRegistrationRoleId = roleId;
            setting.UpdatedAt = now;
            setting.UpdatedBy = actor;
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
