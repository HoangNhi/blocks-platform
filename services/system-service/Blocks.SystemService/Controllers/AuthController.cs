using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Services;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : BaseController<AuthController>
    {
        private readonly IAuthService _service;
        private readonly IAuditLogWriter _auditWriter;
        private readonly ISystemReferenceGuard _referenceGuard;

        public AuthController(IAuthService service, IAuditLogWriter auditWriter, ISystemReferenceGuard referenceGuard)
        {
            _service = service;
            _auditWriter = auditWriter;
            _referenceGuard = referenceGuard;
        }

        [HttpPost, Route("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            var ipAddress = GetClientIpAddress() ?? string.Empty;
            try
            {
                var result = await _service.LoginAsync(request, ipAddress);

                await _auditWriter.WriteAsync(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    UserId = result.Id,
                    UserName = request.Username,
                    Action = "LOGIN",
                    EntityName = "Auth",
                    EntityId = result.Id.ToString(),
                    OldValues = null,
                    NewValues = null,
                    IpAddress = ipAddress,
                    ServiceName = "SystemService",
                    IsSuccess = true,
                    ErrorMessage = null,
                    CreatedAt = DateTime.UtcNow
                });

                return Ok(new BaseResponse<LoginResponse> { Data = result, Success = true });
            }
            catch (Exception ex)
            {
                var failedLoginUserId = await _referenceGuard.TryResolveUserIdByUsernameAsync(request.Username);
                if (failedLoginUserId.HasValue)
                {
                    await _auditWriter.WriteAsync(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        UserId = failedLoginUserId.Value,
                        UserName = request.Username,
                        Action = "LOGIN",
                        EntityName = "Auth",
                        EntityId = null,
                        OldValues = null,
                        NewValues = null,
                        IpAddress = ipAddress,
                        ServiceName = "SystemService",
                        IsSuccess = false,
                        ErrorMessage = ex.Message,
                        CreatedAt = DateTime.UtcNow
                    });
                }

                throw;
            }
        }

        [HttpPost, Route("logout")]
        public async Task<IActionResult> Logout()
        {
            var userId = User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value;
            var userName = User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "Unknown";
            var ipAddress = GetClientIpAddress() ?? string.Empty;
            Guid? resolvedUserId = null;
            if (Guid.TryParse(userId, out var parsedUserId))
            {
                resolvedUserId = await _referenceGuard.TryResolveExistingUserIdAsync(parsedUserId);
            }

            if (resolvedUserId.HasValue)
            {
                await _auditWriter.WriteAsync(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    UserId = resolvedUserId.Value,
                    UserName = userName,
                    Action = "LOGOUT",
                    EntityName = "Auth",
                    EntityId = userId,
                    OldValues = null,
                    NewValues = null,
                    IpAddress = ipAddress,
                    ServiceName = "SystemService",
                    IsSuccess = true,
                    ErrorMessage = null,
                    CreatedAt = DateTime.UtcNow
                });
            }

            return Ok(new BaseResponse<object> { Data = null, Success = true, Message = "Đăng xuất thành công" });
        }

        [HttpPost, Route("refresh-token")]
        [AllowAnonymous]
        public async Task<IActionResult> RefreshToken(RefreshTokenRequest request)
        {
            var result = await _service.RefreshTokenAsync(request, GetClientIpAddress() ?? string.Empty);
            return Ok(new BaseResponse<ModelToken> { Data = result, Success = true });
        }
    }
}
