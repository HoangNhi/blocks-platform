using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using FluentValidation;

namespace Blocks.CatalogService.DTOs.CoreFeature.FileType.Requests
{
    public class FileTypeRequest : BaseRequest
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = null!;
        public string Name { get; set; } = null!;
        public string? Description { get; set; }
    }

    public class FileTypeRequestValidator : AbstractValidator<FileTypeRequest>
    {
        public FileTypeRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên loại tệp không được để trống");
        }
    }
}
