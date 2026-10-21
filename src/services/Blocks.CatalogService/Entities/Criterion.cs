using System;
using System.Collections.Generic;

namespace Blocks.CatalogService.Entities;

public partial class Criterion
{
    public Guid Id { get; set; }

    public Guid StandardId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public bool IsPrerequisite { get; set; }

    public string? DiagnosticQuestions { get; set; }

    public string? Description { get; set; }

    public int Order { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public virtual ICollection<CriterionRequirement> CriterionRequirements { get; set; } = new List<CriterionRequirement>();

    public virtual Standard Standard { get; set; } = null!;
}
