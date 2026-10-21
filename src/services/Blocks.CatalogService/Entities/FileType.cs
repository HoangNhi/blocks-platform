using System;
using System.Collections.Generic;

namespace Blocks.CatalogService.Entities;

public partial class FileType
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public virtual ICollection<CriterionRequirement> CriterionRequirements { get; set; } = new List<CriterionRequirement>();
}
