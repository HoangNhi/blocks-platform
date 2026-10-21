using System;
using System.Collections.Generic;

namespace Blocks.CatalogService.Entities;

public partial class CriterionRequirement
{
    public Guid Id { get; set; }

    public Guid CriterionId { get; set; }

    public Guid FileTypeId { get; set; }

    public bool IsMandatory { get; set; }

    public int MinQuantity { get; set; }

    public string? Suggestion { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    public virtual Criterion Criterion { get; set; } = null!;

    public virtual FileType FileType { get; set; } = null!;
}
