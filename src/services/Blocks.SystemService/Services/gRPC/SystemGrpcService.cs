using Blocks.SystemService.Protos;
using Blocks.SystemService.Services.CoreFeature.User;
using Blocks.SystemService.Infrastructure.Data;
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

        public SystemGrpcService(SystemContext context, IUserService userService)
        {
            _context = context;
            _userService = userService;
        }

        public override async Task<CheckActionResponse> CheckPermission(CheckPermissionRequest request, ServerCallContext context)
        {
            if (!Guid.TryParse(request.UserId, out var userId) || userId == Guid.Empty)
            {
                return new CheckActionResponse { Success = false };
            }

            var permission = await _userService.CheckPermission(new DTOs.CoreFeature.User.Requests.CheckPermissionRequest
            {
                UserId = userId,
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
            var ids = new List<Guid>(request.UserIds.Count);
            foreach (var idStr in request.UserIds)
            {
                if (!Guid.TryParse(idStr, out var id) || id == Guid.Empty)
                {
                    throw new RpcException(new Status(StatusCode.InvalidArgument, "UserIds không hợp lệ."));
                }
                ids.Add(id);
            }

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
    }
}
