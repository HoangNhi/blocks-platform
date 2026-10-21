using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using Blocks.CatalogService.DTOs.Common;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Requests
{
    public class StandardSetRequest : BaseRequest
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

    public class StandardSetRequestValidator : AbstractValidator<StandardSetRequest>
    {
        public StandardSetRequestValidator()
        {
            RuleFor(x => x.Code)
                .NotEmpty().WithMessage("Mã bộ tiêu chuẩn không được để trống");

            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên bộ tiêu chuẩn không được để trống");

            RuleFor(x => x.EvaluationMode)
                .NotEmpty().WithMessage("Chế độ đánh giá không hợp lệ");

            RuleFor(x => x.ChartType)
                .InclusiveBetween(0, 1).WithMessage("Loại chart không hợp lệ");
        }
    }
}
