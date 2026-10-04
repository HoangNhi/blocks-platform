using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.SystemService.Controllers;

public sealed class ServiceAuthorizationFilter(IConfiguration configuration) : IAsyncAuthorizationFilter
{
    private const string HeaderName = "X-Service-Authorization";
    private const int MaximumKeyBytes = 512;

    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var configuredKey = configuration["InternalService:AuthorizationKey"];
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            context.Result = new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
            return Task.CompletedTask;
        }

        var expectedKey = Encoding.UTF8.GetBytes(configuredKey);
        if (expectedKey.Length > MaximumKeyBytes)
        {
            context.Result = new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
            return Task.CompletedTask;
        }

        var headers = context.HttpContext.Request.Headers;
        if (!headers.TryGetValue(HeaderName, out var values)
            || values.Count != 1
            || string.IsNullOrWhiteSpace(values[0])
            || values[0]!.Contains(','))
        {
            context.Result = new UnauthorizedResult();
            return Task.CompletedTask;
        }

        var suppliedKey = Encoding.UTF8.GetBytes(values[0]!);
        if (suppliedKey.Length == 0 || suppliedKey.Length > MaximumKeyBytes)
        {
            context.Result = new UnauthorizedResult();
            return Task.CompletedTask;
        }

        var expectedHash = SHA256.HashData(expectedKey);
        var suppliedHash = SHA256.HashData(suppliedKey);
        if (!CryptographicOperations.FixedTimeEquals(expectedHash, suppliedHash))
        {
            context.Result = new UnauthorizedResult();
        }

        return Task.CompletedTask;
    }
}
