using System;
using System.Collections.Generic;

namespace Blocks.CatalogService.Entities;

public partial class StandardSet
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public int EvaluationMode { get; set; }

    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = null!;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }

    public bool IsActived { get; set; }

    public bool IsDeleted { get; set; }

    /// <summary>
    /// 0 = SpiderChart, 1 = BarChart
    /// </summary>
    public int ChartType { get; set; }

    public virtual ICollection<Standard> Standards { get; set; } = new List<Standard>();
}
