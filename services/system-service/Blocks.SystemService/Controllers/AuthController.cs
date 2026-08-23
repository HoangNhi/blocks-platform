using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Controllers.Base;
using Blocks.Shared.Common;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Auth.Requests;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.RefreshToken.Requests;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Services;
using Blocks.SystemService.Infrastructure.Validation;
using Blocks.SystemService.Services.CoreFeature.Auth;
using Blocks.SystemService.Services.CoreFeature.Registration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Blocks.SystemService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : BaseController<AuthController>
    {
        private readonly IAuthService _service;
        private readonly IAuditLogWriter _auditWriter;
        private readonly ISystemReferenceGuard _referenceGuard;
        private readonly RegistrationService _registrationService;

        public AuthController(
            IAuthService service,
            IAuditLogWriter auditWriter,
            ISystemReferenceGuard referenceGuard,
            RegistrationService registrationService)
        {
            _service = service;
            _auditWriter = auditWriter;
            _referenceGuard = referenceGuard;
            _registrationService = registrationService;
        }

        [HttpGet, Route("registration-availability")]
        [AllowAnonymous]
        public async Task<IActionResult> GetRegistrationAvailability()
        {
            var result = await _registrationService.GetAvailabilityAsync(HttpContext.RequestAborted);
            return Ok(new BaseResponse<RegistrationAvailabilityResponse> { Data = result, Success = true });
        }

        [HttpPost, Route("bootstrap")]
        [EnableRateLimiting(RegistrationOptions.BootstrapPolicy)]
        [AllowAnonymous]
        public async Task<IActionResult> Bootstrap(RegisterRequest request)
        {
            var configuredSecret = ResolveBootstrapSecret(
                Environment.GetEnvironmentVariable("Bootstrap__Secret"),
                HttpContext.RequestServices.GetRequiredService<IConfiguration>().GetSection("Bootstrap")["Secret"]);
            var suppliedSecret = Request.Headers["X-Blocks-Bootstrap-Secret"].ToString();
            var result = await _registrationService.BootstrapAsync(
                request,
                GetClientIpAddress() ?? string.Empty,
                configuredSecret ?? string.Empty,
                suppliedSecret,
                HttpContext.RequestAborted);
            return Ok(new BaseResponse<RegistrationResponse> { Data = result, Success = true, Message = "Bootstrap tài khoản quản trị thành công" });
        }

        public static string ResolveBootstrapSecret(string? environmentSecret, string? configuredSecret)
        {
            return string.IsNullOrWhiteSpace(environmentSecret) ? configuredSecret ?? string.Empty : environmentSecret;
        }

        [HttpPost, Route("register")]
        [EnableRateLimiting(RegistrationOptions.RegistrationPolicy)]
        [AllowAnonymous]
        public async Task<IActionResult> Register(RegisterRequest request)
        {
            var result = await _registrationService.RegisterAsync(request, GetClientIpAddress() ?? string.Empty, HttpContext.RequestAborted);
            return Ok(new BaseResponse<RegistrationResponse> { Data = result, Success = true, Message = "Đăng ký tài khoản thành công" });
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
