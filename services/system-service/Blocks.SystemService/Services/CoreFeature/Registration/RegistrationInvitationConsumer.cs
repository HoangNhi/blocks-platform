using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using AutoDependencyRegistration.Attributes;

namespace Blocks.SystemService.Services.CoreFeature.Registration;

public interface IRegistrationInvitationConsumer
{
    Task<bool> TryConsumeAsync(SystemContext context, Guid invitationId, Guid userId, string username, CancellationToken cancellationToken = default);
}

[RegisterClassAsTransient]
public sealed class RegistrationInvitationConsumer : IRegistrationInvitationConsumer
{
    public async Task<bool> TryConsumeAsync(SystemContext context, Guid invitationId, Guid userId, string username, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        if (!context.Database.IsRelational())
        {
            var invitation = await context.Invitations.FindAsync([invitationId], cancellationToken);
            if (invitation is null || invitation.ConsumedAt.HasValue || !invitation.IsActive || invitation.IsDeleted || invitation.ExpiresAt <= now)
            {
                return false;
            }

            invitation.ConsumedAt = now;
            invitation.ConsumedBy = userId;
            invitation.UpdatedAt = now;
            invitation.UpdatedBy = username;
            return true;
        }

        var affected = await context.Invitations
            .Where(invitation => invitation.Id == invitationId
                && invitation.ConsumedAt == null
                && invitation.IsActive
                && !invitation.IsDeleted
                && invitation.ExpiresAt > now)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(invitation => invitation.ConsumedAt, now)
                .SetProperty(invitation => invitation.UpdatedAt, now)
                .SetProperty(invitation => invitation.UpdatedBy, username), cancellationToken);

        if (affected != 1)
        {
            return false;
        }

        var trackedInvitation = context.Invitations.Local.SingleOrDefault(invitation => invitation.Id == invitationId)
            ?? await context.Invitations.FindAsync([invitationId], cancellationToken);
        if (trackedInvitation is null)
        {
            return false;
        }

        trackedInvitation.ConsumedAt = now;
        trackedInvitation.ConsumedBy = userId;
        trackedInvitation.UpdatedAt = now;
        trackedInvitation.UpdatedBy = username;
        return true;
    }
}
