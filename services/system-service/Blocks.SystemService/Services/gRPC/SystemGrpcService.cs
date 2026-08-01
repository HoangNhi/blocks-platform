using Blocks.SystemService.Contracts.Grpc;
using Blocks.SystemService.Services.CoreFeature.User;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Blocks.SystemService.Services.SystemGrpc
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class SystemGrpcService : SystemProto.SystemProtoBase
    {
        private readonly IUserService _userService;

        public SystemGrpcService(IUserService userService)
        {
            _userService = userService;
        }

        public override async Task<CheckActionResponse> CheckPermission(CheckPermissionRequest request, ServerCallContext context)
        {
            if (!Guid.TryParse(request.UserId, out var userId))
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
            var ids = request.UserIds
                .Select(x => Guid.TryParse(x, out var parsed) ? parsed : Guid.Empty)
                .Where(x => x != Guid.Empty)
                .Distinct()
                .ToList();

            var users = await _userService.GetByIds(ids);

            var response = new GetUsersByIdsResponse();
            response.Users.AddRange(users.Select(ToUserSummary));
            return response;
        }

        public override async Task<GetUsersByUsernamesResponse> GetUsersByUsernames(GetUsersByUsernamesRequest request, ServerCallContext context)
        {
            var usernames = request.Usernames
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var users = await _userService.GetByUsernames(usernames);

            var response = new GetUsersByUsernamesResponse();
            response.Users.AddRange(users.Select(ToUserSummary));
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

            response.Users.AddRange(result.Data.Select(ToUserSummary));

            return response;
        }

        private static UserSummary ToUserSummary(DTOs.CoreFeature.User.Dtos.ModelUser user)
        {
            return new UserSummary
            {
                Id = user.Id.ToString(),
                Fullname = user.Fullname ?? string.Empty,
                Avatar = user.Avatar ?? string.Empty,
                Username = user.Username ?? string.Empty,
                IsActived = user.IsActived,
                Email = user.Email ?? string.Empty
            };
        }
    }
}
