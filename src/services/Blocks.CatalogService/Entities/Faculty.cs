using System;
using System.Collections.Generic;

namespace Blocks.CatalogService.Entities;

public partial class Faculty
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public DateTime? CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool? IsActived { get; set; }

    public bool IsDeleted { get; set; }
}
