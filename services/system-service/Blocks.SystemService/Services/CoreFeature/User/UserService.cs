using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.Commons.UploadFile;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Blocks.SystemService.Services.CoreFeature.User
{
    [RegisterClassAsTransient]
    public class UserService : IUserService
    {
        private const string DefaultPassword = "__BLOCKS_PASSWORD_UNCHANGED__";
        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly IUploadFileService _uploadFileService;
        private readonly ISystemReferenceGuard _referenceGuard;

        public UserService(
            SystemContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor,
            IUploadFileService uploadFileService,
            ISystemReferenceGuard referenceGuard)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
            _uploadFileService = uploadFileService;
            _referenceGuard = referenceGuard;
        }

        public async Task<ModelUser> GetById(GetByIdRequest request)
        {
            var data = await _context.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            var result = _mapper.Map<ModelUser>(data);
            result.Password = DefaultPassword;

            return result;
        }

        public async Task<List<ModelUser>> GetByIds(List<Guid> ids)
        {
            var users = await _context.Users
                .AsNoTracking()
                .Where(x => ids.Contains(x.Id) && !x.IsDeleted)
                .ToListAsync();
            return users.Select(x => _mapper.Map<ModelUser>(x)).ToList();
        }

        public async Task<List<ModelUser>> GetByUsernames(List<string> usernames)
        {
            var users = await _context.Users
                .AsNoTracking()
                .Where(x => usernames.Contains(x.Username) && !x.IsDeleted)
                .ToListAsync();
            return users.Select(x => _mapper.Map<ModelUser>(x)).ToList();
        }

        public async Task<GetListPagingResponse<ModelUser>> GetByIdsPaged(
            List<Guid> ids,
            string? textSearch,
            int pageIndex,
            int pageSize)
        {
            var safePageIndex = pageIndex <= 0 ? 1 : pageIndex;
            var safePageSize = pageSize <= 0 ? 10 : pageSize;

            var query = _context.Users
                .AsNoTracking()
                .Where(x => ids.Contains(x.Id) && !x.IsDeleted);

            if (!string.IsNullOrWhiteSpace(textSearch))
            {
                var text = textSearch.Trim().ToLower();
                query = query.Where(x =>
                    x.Fullname.ToLower().Contains(text)
                    || x.Username.ToLower().Contains(text)
                    || x.Email.ToLower().Contains(text));
            }

            var totalRow = await query.CountAsync();
            var users = await query
                .OrderBy(x => x.Username)
                .Skip((safePageIndex - 1) * safePageSize)
                .Take(safePageSize)
                .ToListAsync();

            return new GetListPagingResponse<ModelUser>
            {
                PageIndex = safePageIndex,
                PageSize = safePageSize,
                TotalRow = totalRow,
                Data = users.Select(x => _mapper.Map<ModelUser>(x)).ToList()
            };
        }

        public async Task<ModelUser> GetCurrentUser()
        {
            var userId = _contextAccessor.HttpContext?.User?.Claims.FirstOrDefault(x => x.Type == "name")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                throw new BusinessException("Người dùng chưa xác thực");
            }
            var data = await _context.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == Guid.Parse(userId) && !x.IsDeleted && x.IsActived);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }
            var result = _mapper.Map<ModelUser>(data);
            result.RoleName = await _context.Roles.AsNoTracking()
                .Where(x => x.Id == data.RoleId && !x.IsDeleted && x.IsActived)
                .Select(x => x.Name)
                .FirstOrDefaultAsync();
            return result;
        }

        public async Task<ModelUser> Insert(UserRequest request)
        {
            var data = _context.Users.Where(x =>
                (x.Username == request.Username || x.Email == request.Email)
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Tên đăng nhập hoặc email đã tồn tại");
            }

            await _referenceGuard.EnsureRoleExistsAsync(request.RoleId);

            var add = _mapper.Map<Entities.User>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.PasswordSalt = Encrypt_DecryptHelper.GenerateSalt();
            add.Password = Encrypt_DecryptHelper.EncodePassword(request.Password, add.PasswordSalt);
            add.CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            add.CreatedAt = DateTime.UtcNow;
            add.Avatar = await _uploadFileService.UploadAvatarAsync(request.FolderUpload, "");

            await _context.Users.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelUser>(add);
        }

        public async Task<ModelUser> Update(UserRequest request)
        {
            var data = _context.Users.Where(x =>
                 (x.Username == request.Username || x.Email == request.Email)
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Tên đăng nhập hoặc email đã tồn tại");
            }

            var update = await _context.Users.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            var oldPassword = update.Password;
            await _referenceGuard.EnsureRoleExistsAsync(request.RoleId);
            _mapper.Map(request, update);

            if (request.Password != DefaultPassword)
            {
                update.Password = Encrypt_DecryptHelper.EncodePassword(request.Password, update.PasswordSalt);
            }
            else
            {
                update.Password = oldPassword;
            }

            update.Avatar = await _uploadFileService.UploadAvatarAsync(request.FolderUpload, update.Avatar);
            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;

            _context.Users.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelUser>(update);
        }

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Users.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
                delete.UpdatedAt = DateTime.UtcNow;

                _context.Users.Update(delete);
            }

            await _context.SaveChangesAsync();
            return string.Join(',', request.Ids);
        }

        public async Task<GetListPagingResponse<ModelUserGetListPaging>> GetList(GetListPagingRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_textsearch", request.TextSearch),
                new NpgsqlParameter("i_pageindex", request.PageIndex - 1),
                new NpgsqlParameter("i_pagesize", request.PageSize),
            };

            var result = await _context.ExecuteFunction<GetListPagingResponse<ModelUserGetListPaging>>("fn_user_getlistpaging", parameters);
            return result;
        }

        public async Task<CheckPermissionResponse> CheckPermission(CheckPermissionRequest request)
        {
            var parameters = new[]
            {
                new NpgsqlParameter("i_user_id", request.UserId),
                new NpgsqlParameter("i_controller", request.Controller),
                new NpgsqlParameter("i_action", request.Action)
            };

            var result = await _context.ExecuteFunction<CheckPermissionResponse>("fn_user_checkpermission", parameters);
            return result;
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var result = await _context.Users.AsNoTracking()
                .Where(x => !x.IsDeleted && x.IsActived)
                .OrderBy(x => x.Username)
                .Select(x => new ModelCombobox
                {
                    Text = "[" + x.Username + "] - " + x.Fullname,
                    Value = x.Id.ToString(),
                })
                .ToListAsync();
            return result;
        }

        public async Task<ModelUser> EditProfile(EditProfileRequest request)
        {
            var currentUserId = _contextAccessor.HttpContext?.User?.Claims.FirstOrDefault(x => x.Type == "name")?.Value;

            if (string.IsNullOrEmpty(currentUserId))
            {
                throw new BusinessException("Người dùng không có quyền thực hiện hành động này");
            }

            var userId = Guid.Parse(currentUserId);

            var data = _context.Users.Where(x =>
                 x.Email == request.Email
                && !x.IsDeleted && x.Id != userId);

            if (data.Any())
            {
                throw new BusinessException("Email đã tồn tại");
            }

            var update = await _context.Users.FindAsync(userId);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);
            update.Avatar = await _uploadFileService.UploadAvatarAsync(request.FolderUpload, update.Avatar);
            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;

            _context.Users.Update(update);
            await _context.SaveChangesAsync();

            var response = _mapper.Map<ModelUser>(update);
            response.Password = DefaultPassword;
            return response;
        }

        public async Task<ModelUser> ChangePassword(ChangePasswordRequest request)
        {
            //GET USER ID
            Guid id = Guid.NewGuid();
            Guid.TryParse(_contextAccessor.HttpContext.User.Claims.Where(c => c.Type == "name")
               .Select(c => c.Value).SingleOrDefault(), out id);

            var update = await _context.Users.FirstOrDefaultAsync(x => x.Id == id && x.Username == _contextAccessor.HttpContext.User.Identity.Name && x.IsDeleted == false);
            if (update == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            if (!request.NewPassword.Equals(request.ConfirmNewPassword)) throw new BusinessException("Xác nhận mật khẩu mới không đúng");

            // Nếu đổi mật khẩu thì cập nhật lại mật khẩu mới
            var pass = Encrypt_DecryptHelper.EncodePassword(request.OldPassword, update.PasswordSalt);
            if (!pass.Equals(update.Password)) throw new BusinessException("Mật khẩu cũ không đúng");

            var salt = Encrypt_DecryptHelper.GenerateSalt();
            update.PasswordSalt = salt;
            update.Password = Encrypt_DecryptHelper.EncodePassword(request.NewPassword, salt);
            update.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            update.UpdatedAt = DateTime.UtcNow;

            _context.Users.Update(update);
            await _context.SaveChangesAsync();

            var response = _mapper.Map<ModelUser>(update);
            response.Password = DefaultPassword;
            return response;
        }
    }
}
