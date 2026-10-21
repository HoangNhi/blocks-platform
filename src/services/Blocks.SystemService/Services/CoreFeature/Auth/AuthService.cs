using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.CoreFeature.Auth
{
    [RegisterClassAsTransient]
    public class AuthService : IAuthService
    {
        private static readonly Guid ExtRoleId = new("551d1351-008e-4910-a39c-1fcdde409fdf");

        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly IConfiguration _config;

        public AuthService(
            SystemContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor,
            IConfiguration config)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
            _config = config;
        }

        public Task<LoginResponse> LoginAsync(LoginRequest request, string ipAddress)
        {
            var user = _context.Users.Where(x => x.Username == request.Username && !x.IsDeleted).FirstOrDefault();
            if (user == null)
            {
                throw new BusinessException("Tài khoản không tồn tại");
            }

            if (!user.IsActived)
            {
                if (user.RoleId == ExtRoleId)
                {
                    throw new BusinessException("Tài khoản hoặc mật khẩu không đúng");
                }

                throw new BusinessException("Tài khoản đã bị vô hiệu");
            }

            var pass = Encrypt_DecryptHelper.EncodePassword(request.Password, user.PasswordSalt);
            if (!pass.Equals(user.Password))
            {
                throw new BusinessException("Tài khoản hoặc mật khẩu không đúng");
            }

            if (user.RoleId == ExtRoleId)
            {
                throw new BusinessException("Tài khoản hoặc mật khẩu không đúng");
            }

            var data = _mapper.Map<LoginResponse>(user);
            var token = _config.GenerateJwtToken(data);
            var refreshToken = _config.GenerateRefreshToken(ipAddress);
            refreshToken.UserId = user.Id;
            _context.RefreshTokens.Add(refreshToken);
            _context.SaveChanges();

            data.RefreshToken = refreshToken.Token.ToString();
            data.AccessToken = token;

            return Task.FromResult(data);
        }

        public ModelToken RefreshToken(RefreshTokenRequest request, string ipAddress)
        {
            var user = getUserByRefreshToken(request.RefreshToken);
            if (user == null || user.RoleId == ExtRoleId)
            {
                throw new BusinessException("Token không hợp lệ");
            }

            var refreshToken = _mapper.Map<ModelRefreshToken>(user.RefreshTokens.Single(x => x.Token == request.RefreshToken));

            if (refreshToken.IsRevoked)
            {
                revokeDescendantRefreshTokens(refreshToken, user, ipAddress, $"Phát hiện Refresh token được sử dụng lại: {request.RefreshToken}");
                _context.SaveChanges();
            }

            if (!refreshToken.IsActive) throw new BusinessException("Token không hợp lệ");

            var newRefreshToken = rotateRefreshToken(refreshToken, ipAddress);
            newRefreshToken.UserId = user.Id;
            _context.RefreshTokens.Add(newRefreshToken);
            _context.SaveChanges();

            return new ModelToken
            {
                AccessToken = _config.GenerateJwtToken(_mapper.Map<ModelUser>(user)),
                RefreshToken = newRefreshToken.Token
            };
        }

        #region Private Methods
        private Entities.User? getUserByRefreshToken(string token)
        {
            return _context.Users.Include(u => u.RefreshTokens).AsNoTracking().SingleOrDefault(u => u.RefreshTokens.Any(t => t.Token == token));
        }

        private void revokeDescendantRefreshTokens(ModelRefreshToken refreshToken, Entities.User user, string ipAddress, string reason)
        {
            if (!string.IsNullOrEmpty(refreshToken.ReplacedByToken))
            {
                var childToken = _mapper.Map<ModelRefreshToken>(user.RefreshTokens.SingleOrDefault(x => x.Token == refreshToken.ReplacedByToken));
                if (childToken.IsActive) revokeRefreshToken(childToken, ipAddress, reason);
                else revokeDescendantRefreshTokens(childToken, user, ipAddress, reason);
            }
        }

        private void revokeRefreshToken(ModelRefreshToken token, string ipAddress, string reason = null, string replacedByToken = null)
        {
            token.RevokedAt = DateTime.UtcNow;
            token.RevokedByIp = ipAddress;
            token.ReasonRevoked = reason;
            token.ReplacedByToken = replacedByToken;
            var updateToken = _mapper.Map<Entities.RefreshToken>(token);
            _context.RefreshTokens.Update(updateToken);
        }

        private RefreshToken rotateRefreshToken(ModelRefreshToken refreshToken, string ipAddress)
        {
            var newRefreshToken = _config.GenerateRefreshToken(ipAddress);
            revokeRefreshToken(refreshToken, ipAddress, "Generating a new refresh token", newRefreshToken.Token);
            return newRefreshToken;
        }
        #endregion
    }
}
