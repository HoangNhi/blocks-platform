using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class Permission
{
    public Guid Id { get; set; }

    public Guid RoleId { get; set; }

    public Guid MenuId { get; set; }

    public bool IsViewed { get; set; }

    public bool IsAdded { get; set; }

    public bool IsUpdated { get; set; }

    public bool IsDeleted { get; set; }

    public bool IsApproved { get; set; }

    public bool IsAnalyzed { get; set; }

    public virtual Menu Menu { get; set; } = null!;

    public virtual Role Role { get; set; } = null!;
}
