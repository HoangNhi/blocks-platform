using System;
using System.Collections.Generic;

namespace Blocks.SystemService.Entities;

public partial class AuditLog
{
    public Guid Id { get; set; }

    public Guid? UserId { get; set; }

    public string UserName { get; set; } = null!;

    public string Action { get; set; } = null!;

    public string EntityName { get; set; } = null!;

    public string? EntityId { get; set; }

    public string? OldValues { get; set; }

    public string? NewValues { get; set; }

    public string? IpAddress { get; set; }

    public string? ServiceName { get; set; }

    public bool IsSuccess { get; set; }

    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
