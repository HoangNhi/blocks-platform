using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;

namespace Blocks.Shared.Common
{
    public class FluentValidationActionFilter : IAsyncActionFilter, IOrderedFilter
    {
        private readonly IOptions<ApiBehaviorOptions> _apiBehaviorOptions;

        public FluentValidationActionFilter(IOptions<ApiBehaviorOptions> apiBehaviorOptions)
        {
            _apiBehaviorOptions = apiBehaviorOptions ?? throw new ArgumentNullException(nameof(apiBehaviorOptions));
        }

        public int Order => -2001;

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            foreach (var parameter in context.ActionDescriptor.Parameters)
            {
                if (context.ActionArguments.TryGetValue(parameter.Name, out var arg) && arg != null)
                {
                    var validatorType = typeof(IValidator<>).MakeGenericType(parameter.ParameterType);
                    if (context.HttpContext.RequestServices.GetService(validatorType) is IValidator validator)
                    {
                        var validationContext = new ValidationContext<object>(arg);
                        var validationResult = await validator.ValidateAsync(validationContext, context.HttpContext.RequestAborted);
                        if (!validationResult.IsValid)
                        {
                            var prefix = parameter.BindingInfo?.BinderModelName;
                            foreach (var error in validationResult.Errors)
                            {
                                var key = string.IsNullOrEmpty(prefix)
                                    ? (error.PropertyName ?? string.Empty)
                                    : (string.IsNullOrEmpty(error.PropertyName)
                                        ? prefix
                                        : (error.PropertyName.StartsWith("[") ? $"{prefix}{error.PropertyName}" : $"{prefix}.{error.PropertyName}"));

                                context.ModelState.AddModelError(key, error.ErrorMessage);
                            }
                        }
                    }
                }
            }

            if (!context.ModelState.IsValid)
            {
                var factory = _apiBehaviorOptions.Value.InvalidModelStateResponseFactory;
                context.Result = factory(context);
                return;
            }

            await next();
        }
    }
}
