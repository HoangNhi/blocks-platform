using System.Security.Cryptography;
using System.Text;
using AutoDependencyRegistration.Attributes;
using Blocks.Shared.Exceptions;
using Blocks.SystemService.Configs;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Dtos;
using Blocks.SystemService.DTOs.CoreFeature.Registration.Requests;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using RoleEntity = Blocks.SystemService.Entities.Role;

namespace Blocks.SystemService.Services.CoreFeature.Registration;

[RegisterClassAsTransient]
public sealed class RegistrationAdminService
{
    private readonly SystemContext _context;

    public RegistrationAdminService(SystemContext context)
    {
        _context = context;
    }

    public async Task<RegistrationSettingsResponse> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var setting = await _context.InstanceSettings
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.IsActive && !x.IsDeleted, cancellationToken);

        return new RegistrationSettingsResponse
        {
            RegistrationMode = setting?.RegistrationMode ?? RegistrationModes.AdminProvisioned,
            DefaultRegistrationRoleId = setting?.DefaultRegistrationRoleId,
        };
    }

    public async Task<RegistrationSettingsResponse> UpdateSettingsAsync(RegistrationSettingsRequest request, string actor, CancellationToken cancellationToken = default)
    {
        if (request.RegistrationMode is not (RegistrationModes.Open or RegistrationModes.InviteOnly or RegistrationModes.AdminProvisioned))
        {
            throw new BusinessException("Chế độ đăng ký không hợp lệ");
        }

        var role = request.DefaultRegistrationRoleId.HasValue
            ? await _context.Roles.SingleOrDefaultAsync(x => x.Id == request.DefaultRegistrationRoleId.Value && x.IsActived && !x.IsDeleted, cancellationToken)
            : null;
        if (request.DefaultRegistrationRoleId.HasValue
            && (role is null || !IsSafeRegistrationRole(role) || await HasUnsafeRegistrationPermissionsAsync(role.Id, cancellationToken)))
        {
            throw new BusinessException("Vai trò đăng ký mặc định không hợp lệ");
        }

        var setting = await _context.InstanceSettings.SingleOrDefaultAsync(x => x.IsActive && !x.IsDeleted, cancellationToken);
        if (setting is null)
        {
            setting = new InstanceSetting { Id = Guid.NewGuid(), CreatedAt = DateTime.UtcNow, CreatedBy = actor, IsActive = true, IsDeleted = false };
            _context.InstanceSettings.Add(setting);
        }
        setting.RegistrationMode = request.RegistrationMode;
        setting.DefaultRegistrationRoleId = request.DefaultRegistrationRoleId;
        setting.UpdatedAt = DateTime.UtcNow;
        setting.UpdatedBy = actor;
        await _context.SaveChangesAsync(cancellationToken);
        return new RegistrationSettingsResponse
        {
            RegistrationMode = setting.RegistrationMode,
            DefaultRegistrationRoleId = setting.DefaultRegistrationRoleId,
        };
    }

    public async Task<(Invitation Invitation, string Token)> CreateInvitationAsync(InvitationCreateRequest request, string actor, CancellationToken cancellationToken = default)
    {
        if (request.ExpiresAt <= DateTime.UtcNow)
        {
            throw new BusinessException("Lời mời phải có thời hạn trong tương lai");
        }
        if (request.RegistrationRoleId.HasValue)
        {
            var role = await _context.Roles.SingleOrDefaultAsync(x => x.Id == request.RegistrationRoleId.Value && x.IsActived && !x.IsDeleted, cancellationToken);
            if (role is null || !role.IsRegistrationEligible || IsProtectedRole(role) || await HasUnsafeRegistrationPermissionsAsync(role.Id, cancellationToken))
            {
                throw new BusinessException("Vai trò đăng ký không hợp lệ");
            }
        }

        if (request.TargetWorkspaceId.HasValue && !await _context.Workspaces.AnyAsync(x => x.Id == request.TargetWorkspaceId.Value && x.IsActive && !x.IsDeleted, cancellationToken))
        {
            throw new BusinessException("Không gian làm việc không tồn tại hoặc đã bị vô hiệu hóa");
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(), TokenHash = RegistrationService.HashInvitationToken(token), ExpiresAt = request.ExpiresAt,
            TargetWorkspaceId = request.TargetWorkspaceId, RegistrationRoleId = request.RegistrationRoleId,
            CreatedAt = DateTime.UtcNow, CreatedBy = actor, IsActive = true, IsDeleted = false
        };
        _context.Invitations.Add(invitation);
        await _context.SaveChangesAsync(cancellationToken);
        return (invitation, token);
    }

    private static bool IsSafeRegistrationRole(RoleEntity role)
    {
        return role.IsRegistrationEligible && !IsProtectedRole(role);
    }

    private static bool IsProtectedRole(RoleEntity role)
    {
        return role.Key.Equals("administrator", StringComparison.OrdinalIgnoreCase)
            || role.Key.Equals("operator", StringComparison.OrdinalIgnoreCase)
            || role.Key.StartsWith("admin.", StringComparison.OrdinalIgnoreCase)
            || role.IsSystem && !role.Key.Equals("member", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<bool> HasUnsafeRegistrationPermissionsAsync(Guid roleId, CancellationToken cancellationToken)
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
