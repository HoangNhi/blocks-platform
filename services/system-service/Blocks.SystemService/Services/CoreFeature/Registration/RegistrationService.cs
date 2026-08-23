using System.Security.Cryptography;
using System.Text;
using AutoDependencyRegistration.Attributes;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Helpers;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using UserEntity = Blocks.SystemService.Entities.User;
using AuditLogEntity = Blocks.SystemService.Entities.AuditLog;
using RoleEntity = Blocks.SystemService.Entities.Role;
namespace Blocks.SystemService.Services.CoreFeature.Registration;

[RegisterClassAsTransient]
public sealed class RegistrationService
{
    private readonly SystemContext _context;
    private readonly IRegistrationWorkspaceProvisioner _workspaceProvisioner;
    private readonly IRegistrationAuditWriter _auditWriter;
    private readonly IRegistrationInvitationConsumer _invitationConsumer;
    private readonly IBootstrapAdvisoryLock _bootstrapLock;

    public RegistrationService(
        SystemContext context,
        IRegistrationWorkspaceProvisioner workspaceProvisioner,
        IRegistrationAuditWriter auditWriter,
        IRegistrationInvitationConsumer invitationConsumer,
        IBootstrapAdvisoryLock? bootstrapLock = null)
    {
        _context = context;
        _workspaceProvisioner = workspaceProvisioner;
        _auditWriter = auditWriter;
        _invitationConsumer = invitationConsumer;
        _bootstrapLock = bootstrapLock ?? new BootstrapAdvisoryLock(context);
    }

    public async Task<RegistrationAvailabilityResponse> GetAvailabilityAsync(CancellationToken cancellationToken = default)
    {
        var setting = await GetSettingAsync(cancellationToken);
        return new RegistrationAvailabilityResponse
        {
            IsAvailable = setting is not null && IsRegistrationModeAvailable(setting.RegistrationMode)
        };
    }

    public static bool IsRegistrationModeAvailable(string? mode)
    {
        return mode is RegistrationModes.Open or RegistrationModes.InviteOnly;
    }

    public async Task<RegistrationResponse> RegisterAsync(RegisterRequest request, string ipAddress, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var setting = await GetSettingAsync(cancellationToken)
                ?? throw new BusinessException("Đăng ký tài khoản hiện không khả dụng");
            if (!string.Equals(setting.RegistrationMode, RegistrationModes.Open, StringComparison.Ordinal)
                && !string.Equals(setting.RegistrationMode, RegistrationModes.InviteOnly, StringComparison.Ordinal))
            {
                throw new BusinessException("Đăng ký tài khoản hiện không khả dụng");
            }

            Invitation? invitation = null;
            if (!string.IsNullOrWhiteSpace(request.InvitationToken))
            {
                var tokenHash = HashInvitationToken(request.InvitationToken);
                invitation = await _context.Invitations.SingleOrDefaultAsync(x => x.TokenHash == tokenHash && x.IsActive && !x.IsDeleted, cancellationToken);
                if (invitation is null || invitation.ConsumedAt.HasValue || invitation.ExpiresAt <= DateTime.UtcNow)
                {
                    throw new BusinessException("Lời mời không hợp lệ hoặc đã hết hạn");
                }
            }
            else if (setting.RegistrationMode == RegistrationModes.InviteOnly)
            {
                throw new BusinessException("Cần có lời mời để đăng ký");
            }

            var roleId = invitation?.RegistrationRoleId ?? setting.DefaultRegistrationRoleId;
            var role = roleId.HasValue
                ? await _context.Roles.SingleOrDefaultAsync(x => x.Id == roleId.Value && x.IsActived && !x.IsDeleted, cancellationToken)
                : null;
            if (role is null || !IsSafeRegistrationRole(role) || await HasProtectedPermissionAsync(role.Id, cancellationToken))
            {
                throw new BusinessException("Vai trò đăng ký mặc định không hợp lệ");
            }

            if (invitation?.TargetWorkspaceId is Guid targetWorkspaceId
                && !await _context.Workspaces.AnyAsync(x => x.Id == targetWorkspaceId && x.IsActive && !x.IsDeleted, cancellationToken))
            {
                throw new BusinessException("Không gian làm việc không tồn tại hoặc đã bị vô hiệu hóa");
            }

            if (await _context.Users.AnyAsync(x => (x.Username.ToLower() == request.Username.ToLower() || x.Email.ToLower() == request.Email.ToLower()) && x.IsActived && !x.IsDeleted, cancellationToken))
            {
                throw new BusinessException("Tên đăng nhập hoặc email đã tồn tại");
            }

            if (request.Password.Trim().Length == 0 || request.Password.Length is < 12 or > 128)
            {
                throw new BusinessException("Mật khẩu phải dài từ 12 đến 128 ký tự và không được chỉ chứa khoảng trắng");
            }

            var user = new UserEntity
            {
                Id = Guid.NewGuid(), Username = request.Username, Email = request.Email, Fullname = request.Fullname,
                PasswordSalt = Encrypt_DecryptHelper.GenerateSalt(), RoleId = role.Id, CreatedAt = DateTime.UtcNow,
                CreatedBy = request.Username, IsActived = true, IsDeleted = false
            };
            user.Password = Encrypt_DecryptHelper.EncodePassword(request.Password, user.PasswordSalt);
            _context.Users.Add(user);

            var workspace = await _workspaceProvisioner.ProvisionAsync(_context, user, request.Fullname, invitation, cancellationToken);
            if (invitation is not null && !await _invitationConsumer.TryConsumeAsync(_context, invitation.Id, user.Id, request.Username, cancellationToken))
            {
                throw new BusinessException("Lời mời không hợp lệ hoặc đã hết hạn");
            }

            await _auditWriter.WriteAsync(_context, new AuditLogEntity
            {
                Id = Guid.NewGuid(), UserId = user.Id, UserName = user.Username, Action = "REGISTER",
                EntityName = "Auth", EntityId = user.Id.ToString(), IpAddress = ipAddress,
                ServiceName = "SystemService", IsSuccess = true, CreatedAt = DateTime.UtcNow
            }, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return new RegistrationResponse
            {
                Id = user.Id, Username = user.Username, Email = user.Email, Fullname = user.Fullname,
                WorkspaceId = workspace.WorkspaceId
            };
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    public static string HashInvitationToken(string token)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }

    public static bool IsBootstrapSecretValid(string configuredSecret, string suppliedSecret)
    {
        var configuredBytes = Encoding.UTF8.GetBytes(configuredSecret);
        var suppliedBytes = Encoding.UTF8.GetBytes(suppliedSecret);
        return CryptographicOperations.FixedTimeEquals(configuredBytes, suppliedBytes);
    }

    public async Task<RegistrationResponse> BootstrapAsync(RegisterRequest request, string ipAddress, string configuredSecret, string suppliedSecret, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(configuredSecret) || !IsBootstrapSecretValid(configuredSecret, suppliedSecret))
        {
            try
            {
                await WriteBootstrapAuditAsync(null, ipAddress, false, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch
            {
            }

            throw new BusinessException("Bootstrap không khả dụng", 404);
        }

        if (request.Password.Trim().Length == 0 || request.Password.Length is < 12 or > 128)
        {
            throw new BusinessException("Mật khẩu phải dài từ 12 đến 128 ký tự và không được chỉ chứa khoảng trắng");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await _bootstrapLock.AcquireAsync(cancellationToken);
            var administratorRoles = await _context.Roles
                .Where(x => x.Key == "administrator" && x.IsActived && !x.IsDeleted)
                .ToListAsync(cancellationToken);
            if (administratorRoles.Count != 1)
            {
                throw new BusinessException("Không thể xác định vai trò quản trị viên", 409);
            }

            var administratorUsers = await _context.Users
                .Where(x => x.RoleId == administratorRoles[0].Id && x.IsActived && !x.IsDeleted)
                .ToListAsync(cancellationToken);
            if (administratorUsers.Count > 1)
            {
                throw new BusinessException("Không thể xác định tài khoản quản trị viên", 409);
            }

            if (administratorUsers.Count == 1)
            {
                throw new BusinessException("Bootstrap không khả dụng", 404);
            }

            if (await _context.Users.AnyAsync(x => (x.Username.ToLower() == request.Username.ToLower() || x.Email.ToLower() == request.Email.ToLower()) && x.IsActived && !x.IsDeleted, cancellationToken))
            {
                throw new BusinessException("Tên đăng nhập hoặc email đã tồn tại");
            }

            var user = new UserEntity
            {
                Id = Guid.NewGuid(), Username = request.Username, Email = request.Email, Fullname = request.Fullname,
                PasswordSalt = Encrypt_DecryptHelper.GenerateSalt(), RoleId = administratorRoles[0].Id, CreatedAt = DateTime.UtcNow,
                CreatedBy = request.Username, IsActived = true, IsDeleted = false
            };
            user.Password = Encrypt_DecryptHelper.EncodePassword(request.Password, user.PasswordSalt);
            _context.Users.Add(user);
            var workspace = await _workspaceProvisioner.ProvisionAsync(_context, user, request.Fullname, null, cancellationToken);
            var setting = await GetSettingAsync(cancellationToken);
            if (setting is null)
            {
                _context.InstanceSettings.Add(new InstanceSetting
                {
                    Id = Guid.NewGuid(), RegistrationMode = RegistrationModes.AdminProvisioned, CreatedAt = DateTime.UtcNow,
                    CreatedBy = request.Username, IsActive = true, IsDeleted = false
                });
            }
            else
            {
                setting.RegistrationMode = RegistrationModes.AdminProvisioned;
                setting.UpdatedAt = DateTime.UtcNow;
                setting.UpdatedBy = request.Username;
            }
            await _auditWriter.WriteAsync(_context, new AuditLogEntity
            {
                Id = Guid.NewGuid(), UserId = user.Id, UserName = user.Username, Action = "BOOTSTRAP",
                EntityName = "Auth", EntityId = user.Id.ToString(), IpAddress = ipAddress,
                ServiceName = "SystemService", IsSuccess = true, CreatedAt = DateTime.UtcNow
            }, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new RegistrationResponse { Id = user.Id, Username = user.Username, Email = user.Email, Fullname = user.Fullname, WorkspaceId = workspace.WorkspaceId };
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private Task WriteBootstrapAuditAsync(Guid? userId, string ipAddress, bool success, CancellationToken cancellationToken)
    {
        return _auditWriter.WriteAsync(_context, new AuditLogEntity
        {
            Id = Guid.NewGuid(), UserId = userId, UserName = "bootstrap", Action = "BOOTSTRAP",
            EntityName = "Auth", EntityId = null, IpAddress = ipAddress, ServiceName = "SystemService",
            IsSuccess = success, CreatedAt = DateTime.UtcNow
        }, cancellationToken);
    }

    private Task<InstanceSetting?> GetSettingAsync(CancellationToken cancellationToken)
    {
        return _context.InstanceSettings.SingleOrDefaultAsync(x => x.IsActive && !x.IsDeleted, cancellationToken);
    }

    private static bool IsSafeRegistrationRole(RoleEntity role)
    {
        return role.IsRegistrationEligible
            && (!role.IsSystem || role.Key.Equals("member", StringComparison.OrdinalIgnoreCase))
            && !role.Key.Equals("administrator", StringComparison.OrdinalIgnoreCase)
            && !role.Key.Equals("operator", StringComparison.OrdinalIgnoreCase)
            && !role.Key.StartsWith("admin.", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<bool> HasProtectedPermissionAsync(Guid roleId, CancellationToken cancellationToken)
    {
        var permissionKeys = await _context.Permissions
            .Where(permission => permission.RoleId == roleId
                && (permission.IsViewed
                    || permission.IsAdded
                    || permission.IsUpdated
                    || permission.IsDeleted
                    || permission.IsApproved
                    || permission.IsAnalyzed))
            .Join(_context.Menus, permission => permission.MenuId, menu => menu.Id, (_, menu) => menu)
            .Where(menu => menu.IsActived && !menu.IsDeleted)
            .Select(menu => menu.PermissionKey)
            .ToListAsync(cancellationToken);

        return permissionKeys.Any(permissionKey => !RegistrationAuthorizationSafety.IsSafePermissionKey(permissionKey));
    }
}
