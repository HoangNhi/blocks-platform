using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class Workspace
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActive { get; set; }

    public bool IsDeleted { get; set; }

    public virtual ICollection<WorkspaceMember> Members { get; set; } = new List<WorkspaceMember>();

    public virtual ICollection<Invitation> Invitations { get; set; } = new List<Invitation>();
}
