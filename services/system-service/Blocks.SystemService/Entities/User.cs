using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class User
{
    public Guid Id { get; set; }

    public string Username { get; set; } = null!;

    public string Fullname { get; set; } = null!;

    public string Password { get; set; } = null!;

    public string PasswordSalt { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public Guid RoleId { get; set; }

    public string Email { get; set; } = null!;

    public string? Avatar { get; set; }

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();

    public virtual ICollection<WorkspaceMember> WorkspaceMemberships { get; set; } = new List<WorkspaceMember>();

    public virtual ICollection<Invitation> ConsumedInvitations { get; set; } = new List<Invitation>();

    public virtual Role Role { get; set; } = null!;
}
