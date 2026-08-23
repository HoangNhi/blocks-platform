using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class Menu
{
    public Guid Id { get; set; }

    public string Controller { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string PermissionKey { get; set; } = null!;

    public Guid SystemGroupId { get; set; }

    public int Sort { get; set; }

    public bool CanView { get; set; }

    public bool CanAdd { get; set; }

    public bool CanUpdate { get; set; }

    public bool CanDelete { get; set; }

    public bool CanApprove { get; set; }

    public bool CanAnalyze { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public bool IsShowMenu { get; set; }

    public virtual ICollection<Permission> Permissions { get; set; } = new List<Permission>();

    public virtual SystemGroup SystemGroup { get; set; } = null!;
}
