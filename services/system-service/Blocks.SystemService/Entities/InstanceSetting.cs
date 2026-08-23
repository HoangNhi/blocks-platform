using System;

namespace Blocks.SystemService.Entities;

public partial class InstanceSetting
{
    public Guid Id { get; set; }

    public string RegistrationMode { get; set; } = null!;

    public Guid? DefaultRegistrationRoleId { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActive { get; set; }

    public bool IsDeleted { get; set; }

    public virtual Role? DefaultRegistrationRole { get; set; }
}
