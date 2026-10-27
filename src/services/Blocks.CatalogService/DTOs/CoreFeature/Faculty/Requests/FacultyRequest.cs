using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests
{
    public class FacultyRequest : BaseRequest
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = null!;
    }

    public class FacultyRequestValidator : AbstractValidator<FacultyRequest>
    {
        public FacultyRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên phòng ban không được để trống");
        }
    }
}
