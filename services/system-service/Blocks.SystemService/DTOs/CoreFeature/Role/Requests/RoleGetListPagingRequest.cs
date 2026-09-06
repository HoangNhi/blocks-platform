using Blocks.Shared.DTOs.Base;
using FluentValidation;

namespace Blocks.SystemService.DTOs.CoreFeature.Role.Requests;

public sealed class RoleGetListPagingRequest : GetListPagingRequest
{
    public bool? IsActived { get; set; }

    public bool? IsSystem { get; set; }

    public bool? IsRegistrationEligible { get; set; }
}

public sealed class RoleGetListPagingRequestValidator : AbstractValidator<RoleGetListPagingRequest>
{
    public RoleGetListPagingRequestValidator()
    {
        RuleFor(request => request.PageIndex)
            .GreaterThanOrEqualTo(1)
            .WithMessage("Trang phai lon hon hoac bang 1");
        RuleFor(request => request.PageSize)
            .InclusiveBetween(1, 100)
            .WithMessage("Kich thuoc trang phai nam trong khoang tu 1 den 100");
    }
}
