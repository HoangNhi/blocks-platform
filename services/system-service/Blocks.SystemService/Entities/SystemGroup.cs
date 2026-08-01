using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class SystemGroup
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public int Sort { get; set; }

    public Guid? ParentId { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public virtual ICollection<SystemGroup> InverseParent { get; set; } = new List<SystemGroup>();

    public virtual ICollection<Menu> Menus { get; set; } = new List<Menu>();

    public virtual SystemGroup? Parent { get; set; }
}
