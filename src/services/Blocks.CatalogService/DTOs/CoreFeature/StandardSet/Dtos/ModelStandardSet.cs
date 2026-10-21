using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Common;

namespace Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Dtos
{
    public class ModelStandardSet : BaseModel
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = null!;
        public string Name { get; set; } = null!;

        /// <summary>
        /// 1. SCORING_7: Áp dụng cho AUN-QA
        /// 2. PASS_FAIL: Áp dụng cho MOET
        /// </summary>
        public int EvaluationMode { get; set; } = ((int)StandardSet_EvaluationMode.SCORING_7);

        public int ChartType { get; set; } = ((int)DashboardChartType.SpiderChart);
    }
}
