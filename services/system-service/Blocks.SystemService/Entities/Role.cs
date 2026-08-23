using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class Role
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public string Key { get; set; } = null!;

    public bool IsSystem { get; set; }

    public bool IsRegistrationEligible { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public virtual ICollection<Permission> Permissions { get; set; } = new List<Permission>();

    public virtual ICollection<User> Users { get; set; } = new List<User>();

    public virtual ICollection<InstanceSetting> RegistrationSettings { get; set; } = new List<InstanceSetting>();

    public virtual ICollection<Invitation> Invitations { get; set; } = new List<Invitation>();
}
