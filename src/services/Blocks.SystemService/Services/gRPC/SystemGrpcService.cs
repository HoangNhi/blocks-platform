using Blocks.SystemService.Protos;
using Blocks.SystemService.Services.CoreFeature.User;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Validation;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.SystemGrpc
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class SystemGrpcService : SystemProto.SystemProtoBase
    {
        private readonly SystemContext _context;
        private readonly IUserService _userService;
        private readonly ISystemReferenceGuard _referenceGuard;

        public SystemGrpcService(SystemContext context, IUserService userService, ISystemReferenceGuard referenceGuard)
        {
            _context = context;
            _userService = userService;
            _referenceGuard = referenceGuard;
        }

        public override async Task<CheckActionResponse> CheckPermission(CheckPermissionRequest request, ServerCallContext context)
        {
            var permission = await _userService.CheckPermission(new DTOs.CoreFeature.User.Requests.CheckPermissionRequest
            {
                UserId = Guid.Parse(request.UserId),
                Controller = request.Controller,
                Action = request.Action
            });

            return new CheckActionResponse
            {
                Success = permission.HasPermission
            };
        }

        public override async Task<GetUsersByIdsResponse> GetUsersByIds(GetUsersByIdsRequest request, ServerCallContext context)
        {
            var ids = request.UserIds.Select(Guid.Parse).ToList();
            var users = await _userService.GetByIds(ids);

            var response = new GetUsersByIdsResponse();
            response.Users.AddRange(users.Select(u => new UserInfo
            {
                Id = u.Id.ToString(),
                Fullname = u.Fullname ?? string.Empty,
                Avatar = u.Avatar ?? string.Empty,
                Username = u.Username ?? string.Empty,
                IsActived = u.IsActived,
                Email = u.Email ?? string.Empty
            }));
            return response;
        }

        public override async Task<GetUsersByUsernamesResponse> GetUsersByUsernames(GetUsersByUsernamesRequest request, ServerCallContext context)
        {
            var users = await _userService.GetByUsernames(request.Usernames.ToList());

            var response = new GetUsersByUsernamesResponse();
            response.Users.AddRange(users.Select(u => new UserInfo
            {
                Id = u.Id.ToString(),
                Fullname = u.Fullname ?? string.Empty,
                Avatar = u.Avatar ?? string.Empty,
                Username = u.Username ?? string.Empty,
                IsActived = u.IsActived,
                Email = u.Email ?? string.Empty
            }));
            return response;
        }

        public override async Task<GetUsersByIdsPagedResponse> GetUsersByIdsPaged(
            GetUsersByIdsPagedRequest request,
            ServerCallContext context)
        {
            var ids = request.UserIds
                .Select(x => Guid.TryParse(x, out var parsed) ? parsed : Guid.Empty)
                .Where(x => x != Guid.Empty)
                .Distinct()
                .ToList();

            var result = await _userService.GetByIdsPaged(
                ids,
                request.TextSearch,
                request.PageIndex,
                request.PageSize);

            var response = new GetUsersByIdsPagedResponse
            {
                PageIndex = result.PageIndex,
                PageSize = result.PageSize,
                TotalRow = result.TotalRow
            };

            response.Users.AddRange(result.Data.Select(u => new UserInfo
            {
                Id = u.Id.ToString(),
                Fullname = u.Fullname ?? string.Empty,
                Avatar = u.Avatar ?? string.Empty,
                Username = u.Username ?? string.Empty,
                IsActived = u.IsActived,
                Email = u.Email ?? string.Empty
            }));

            return response;
        }

        public override async Task<GetActiveUsersExceptRoleResponse> GetActiveUsersExceptRole(
            GetActiveUsersExceptRoleRequest request,
            ServerCallContext context)
        {
            if (!Guid.TryParse(request.ExcludedRoleId, out var excludedRoleId))
            {
                return new GetActiveUsersExceptRoleResponse();
            }

            var users = await _context.Users
                .AsNoTracking()
                .Where(u => !u.IsDeleted && u.IsActived && u.RoleId != excludedRoleId)
                .OrderBy(u => u.Fullname)
                .ThenBy(u => u.Username)
                .Select(u => new UserInfo
                {
                    Id = u.Id.ToString(),
                    Fullname = u.Fullname ?? string.Empty,
                    Avatar = u.Avatar ?? string.Empty,
                    Username = u.Username ?? string.Empty,
                    IsActived = u.IsActived,
                    Email = u.Email ?? string.Empty
                })
                .ToListAsync();

            var response = new GetActiveUsersExceptRoleResponse();
            response.Users.AddRange(users);
            return response;
        }

        public override async Task<SetUsersActivedResponse> SetUsersActived(SetUsersActivedRequest request, ServerCallContext context)
        {
            var userIds = request.UserIds
                .Select(id => Guid.TryParse(id, out var value) ? value : (Guid?)null)
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();

            if (userIds.Count == 0)
            {
                return new SetUsersActivedResponse { Success = true };
            }

            var users = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .ToListAsync();

            foreach (var user in users)
            {
                user.IsActived = request.IsActived;
            }

            await _context.SaveChangesAsync();

            return new SetUsersActivedResponse { Success = true };
        }

        public override async Task<CreateExternalUserResponse> CreateExternalUser(
            CreateExternalUserRequest request, ServerCallContext context)
        {
            var exists = await _context.Users.AnyAsync(x =>
                (x.Username == request.Username || x.Email == request.Email) && !x.IsDeleted);

            if (exists)
            {
                return new CreateExternalUserResponse
                {
                    Success = false,
                    Message = "Tên đăng nhập hoặc email đã tồn tại."
                };
            }

            if (!Guid.TryParse(request.RoleId, out var roleId))
            {
                return new CreateExternalUserResponse
                {
                    Success = false,
                    Message = "RoleId không hợp lệ."
                };
            }

            try
            {
                await _referenceGuard.EnsureRoleExistsAsync(roleId);
            }
            catch (Blocks.Shared.Exceptions.BusinessException ex)
            {
                return new CreateExternalUserResponse
                {
                    Success = false,
                    Message = ex.Message
                };
            }

            var salt = Encrypt_DecryptHelper.GenerateSalt();
            var user = new Entities.User
            {
                Id = Guid.NewGuid(),
                Username = request.Username.Trim(),
                Fullname = request.Fullname.Trim(),
                Email = request.Email.Trim(),
                Password = Encrypt_DecryptHelper.EncodePassword(request.Password, salt),
                PasswordSalt = salt,
                RoleId = roleId,
                IsActived = true,
                IsDeleted = false,
                CreatedBy = "System",
                CreatedAt = DateTime.UtcNow,
                Avatar = string.Empty
            };

            await _context.Users.AddAsync(user);
            await _context.SaveChangesAsync();

            return new CreateExternalUserResponse
            {
                Id = user.Id.ToString(),
                Success = true
            };
        }

        public override async Task<UpdateUserProfileResponse> UpdateUserProfile(
            UpdateUserProfileRequest request,
            ServerCallContext context)
        {
            if (!Guid.TryParse(request.UserId, out var userId))
            {
                return new UpdateUserProfileResponse
                {
                    Success = false,
                    Message = "UserId không hợp lệ."
                };
            }

            try
            {
                var user = await _userService.UpdateUserProfileById(
                    userId,
                    request.Fullname,
                    request.Username,
                    request.Email,
                    string.IsNullOrWhiteSpace(request.Password) ? null : request.Password);

                return new UpdateUserProfileResponse
                {
                    Success = true,
                    Message = string.Empty,
                    User = new UserInfo
                    {
                        Id = user.Id.ToString(),
                        Fullname = user.Fullname ?? string.Empty,
                        Avatar = user.Avatar ?? string.Empty,
                        Username = user.Username ?? string.Empty,
                        IsActived = user.IsActived,
                        Email = user.Email ?? string.Empty
                    }
                };
            }
            catch (Exception ex)
            {
                return new UpdateUserProfileResponse
                {
                    Success = false,
                    Message = ex.Message
                };
            }
        }

        public override async Task<DeleteExternalUserResponse> DeleteExternalUser(
            DeleteExternalUserRequest request,
            ServerCallContext context)
        {
            if (!Guid.TryParse(request.UserId, out var userId))
            {
                return new DeleteExternalUserResponse
                {
                    Success = false,
                    Message = "UserId không hợp lệ."
                };
            }

            var user = await _context.Users
                .FirstOrDefaultAsync(x => x.Id == userId && !x.IsDeleted);

            if (user == null)
            {
                return new DeleteExternalUserResponse
                {
                    Success = true,
                    Message = string.Empty
                };
            }

            if (user.RoleId != new Guid("551d1351-008e-4910-a39c-1fcdde409fdf"))
            {
                return new DeleteExternalUserResponse
                {
                    Success = false,
                    Message = "Chỉ có thể xóa tài khoản có vai trò External Reviewer."
                };
            }

            user.IsDeleted = true;
            user.IsActived = false;
            await _context.SaveChangesAsync();

            return new DeleteExternalUserResponse
            {
                Success = true,
                Message = string.Empty
            };
        }
    }
}
