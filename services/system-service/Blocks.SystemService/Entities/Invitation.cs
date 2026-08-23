using System;

namespace Blocks.SystemService.Entities;

public partial class Invitation
{
    public Guid Id { get; set; }

    public string TokenHash { get; set; } = null!;

    public DateTime ExpiresAt { get; set; }

    public DateTime? ConsumedAt { get; set; }

    public Guid? ConsumedBy { get; set; }

    public Guid? TargetWorkspaceId { get; set; }

    public Guid? RegistrationRoleId { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActive { get; set; }

    public bool IsDeleted { get; set; }

    public virtual Workspace? TargetWorkspace { get; set; }

    public virtual Role? RegistrationRole { get; set; }

    public virtual User? Consumer { get; set; }
}
