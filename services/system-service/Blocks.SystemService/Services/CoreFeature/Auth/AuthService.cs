using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.DTOs.CoreFeature.User.Dtos;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Services.CoreFeature.Auth
{
    [RegisterClassAsTransient]
    public class AuthService : IAuthService
    {
        private readonly SystemContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;
        private readonly IJwtTokenService _jwtTokenService;

        public AuthService(
            SystemContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor,
            IJwtTokenService jwtTokenService)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
            _jwtTokenService = jwtTokenService;
        }

        public async Task<LoginResponse> LoginAsync(LoginRequest request, string ipAddress)
        {
            var user = await _context.Users.FirstOrDefaultAsync(x => x.Username == request.Username && !x.IsDeleted);
            if (user == null)
            {
                throw new BusinessException("Tài khoản không tồn tại");
            }

            if (!user.IsActived)
            {
                throw new BusinessException("Tài khoản đã bị vô hiệu");
            }

            var pass = Encrypt_DecryptHelper.EncodePassword(request.Password, user.PasswordSalt);
            if (!pass.Equals(user.Password))
            {
                throw new BusinessException("Tài khoản hoặc mật khẩu không đúng");
            }

            var tokenUser = _mapper.Map<ModelUser>(user);
            var roleName = await _context.Roles.AsNoTracking()
                .Where(x => x.Id == user.RoleId && !x.IsDeleted && x.IsActived)
                .Select(x => x.Name)
                .FirstOrDefaultAsync();
            var token = _jwtTokenService.GenerateJwtToken(tokenUser);
            var refreshToken = _jwtTokenService.GenerateRefreshToken(ipAddress);
            refreshToken.UserId = user.Id;

            _context.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            return new LoginResponse
            {
                Id = user.Id,
                Username = user.Username,
                Fullname = user.Fullname,
                RoleId = user.RoleId,
                RoleName = roleName,
                Email = user.Email,
                Avatar = user.Avatar,
                RefreshToken = refreshToken.Token,
                AccessToken = token
            };
        }

        public async Task<ModelToken> RefreshTokenAsync(RefreshTokenRequest request, string ipAddress)
        {
            var user = await GetUserByRefreshTokenAsync(request.RefreshToken);
            if (user == null)
            {
                throw new BusinessException("Token không hợp lệ");
            }

            var refreshToken = user.RefreshTokens.SingleOrDefault(x => x.Token == request.RefreshToken);
            if (refreshToken == null)
            {
                throw new BusinessException("Token không hợp lệ");
            }

            if (IsRevoked(refreshToken))
            {
                RevokeDescendantRefreshTokens(refreshToken, user, ipAddress, $"Đã phát hiện refresh token được sử dụng lại: {request.RefreshToken}");
                await _context.SaveChangesAsync();
            }

            if (!IsActive(refreshToken))
            {
                throw new BusinessException("Token không hợp lệ");
            }

            var newRefreshToken = RotateRefreshToken(refreshToken, ipAddress);
            newRefreshToken.UserId = user.Id;
            _context.RefreshTokens.Add(newRefreshToken);
            await _context.SaveChangesAsync();

            return new ModelToken
            {
                AccessToken = _jwtTokenService.GenerateJwtToken(_mapper.Map<ModelUser>(user)),
                RefreshToken = newRefreshToken.Token
            };
        }

        private Task<Entities.User?> GetUserByRefreshTokenAsync(string token)
        {
            return _context.Users
                .Include(u => u.RefreshTokens)
                .SingleOrDefaultAsync(u => u.RefreshTokens.Any(t => t.Token == token));
        }

        private void RevokeDescendantRefreshTokens(Entities.RefreshToken refreshToken, Entities.User user, string ipAddress, string reason)
        {
            if (string.IsNullOrEmpty(refreshToken.ReplacedByToken))
            {
                return;
            }

            var childToken = user.RefreshTokens.SingleOrDefault(x => x.Token == refreshToken.ReplacedByToken);
            if (childToken == null)
            {
                return;
            }

            if (IsActive(childToken))
            {
                RevokeRefreshToken(childToken, ipAddress, reason);
            }
            else
            {
                RevokeDescendantRefreshTokens(childToken, user, ipAddress, reason);
            }
        }

        private static void RevokeRefreshToken(Entities.RefreshToken token, string ipAddress, string? reason = null, string? replacedByToken = null)
        {
            token.RevokedAt = DateTime.UtcNow;
            token.RevokedByIp = ipAddress;
            token.ReasonRevoked = reason;
            token.ReplacedByToken = replacedByToken;
        }

        private Entities.RefreshToken RotateRefreshToken(Entities.RefreshToken refreshToken, string ipAddress)
        {
            var newRefreshToken = _jwtTokenService.GenerateRefreshToken(ipAddress);
            RevokeRefreshToken(refreshToken, ipAddress, "Generating a new refresh token", newRefreshToken.Token);
            return newRefreshToken;
        }

        private static bool IsExpired(Entities.RefreshToken token)
        {
            return DateTime.UtcNow >= token.ExpiresAt;
        }

        private static bool IsRevoked(Entities.RefreshToken token)
        {
            return token.RevokedAt != null;
        }

        private static bool IsActive(Entities.RefreshToken token)
        {
            return !IsRevoked(token) && !IsExpired(token);
        }
    }
}
