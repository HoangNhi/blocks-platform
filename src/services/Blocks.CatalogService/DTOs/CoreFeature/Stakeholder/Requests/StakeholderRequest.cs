using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Requests
{
    public class StakeholderRequest : BaseRequest
    {
        public Guid Id { get; set; }

        public string FullName { get; set; } = null!;

        public string Email { get; set; } = null!;

        /// <summary>
        /// 1. Sinh viên, 2. Cựu sinh viên, 3. Nhà tuyển dụng, 4. Giảng viên
        /// </summary>
        public int? Type { get; set; }

        public string? Description { get; set; }
    }

    public class StakeholderRequestValidator : AbstractValidator<StakeholderRequest>
    {
        public StakeholderRequestValidator()
        {
            RuleFor(x => x.FullName).NotEmpty().WithMessage("Họ tên không được để trống");
            RuleFor(x => x.Email).NotEmpty().WithMessage("Email không được để trống")
                .EmailAddress().WithMessage("Email không đúng định dạng");
            RuleFor(x => x.Type).NotEmpty().WithMessage("Loại đối tượng không được để trống");
        }
    }
}
