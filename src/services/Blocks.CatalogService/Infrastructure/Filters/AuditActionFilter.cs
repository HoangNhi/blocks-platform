using System.Text;
using System.Text.Json;
using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Protos;
using Grpc.Core;
using Microsoft.AspNetCore.Mvc;
using Polly;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.CatalogService.Infrastructure.Filters;

public class AuditActionFilter : IAsyncActionFilter
{
    private readonly AuditProto.AuditProtoClient _auditClient;
    private readonly ILogger<AuditActionFilter> _logger;

    private static readonly HashSet<string> AuditableMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "POST", "PUT", "DELETE"
    };

    private static readonly HashSet<string> SkipActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "get-list", "get-by-id", "get-all-combobox", "get-user-in-cycle"
    };

    private static readonly Dictionary<string, string> ActionMap = new(StringComparer.OrdinalIgnoreCase)
    {
        { "insert", "CREATE" },
        { "update", "UPDATE" },
        { "delete-list", "DELETE" },
        { "add-users-to-cycle", "ADD_USERS_TO_CYCLE" },
        { "remove-user-from-cycle", "REMOVE_USER_FROM_CYCLE" }
    };

    public AuditActionFilter(AuditProto.AuditProtoClient auditClient, ILogger<AuditActionFilter> logger)
    {
        _auditClient = auditClient;
        _logger = logger;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var httpMethod = context.HttpContext.Request.Method;
        if (!AuditableMethods.Contains(httpMethod)) { await next(); return; }

        var routeName = GetRouteName(context);
        if (SkipActions.Contains(routeName)) { await next(); return; }

        var auditAction = ResolveAction(routeName, httpMethod);
        context.HttpContext.Items["AuditAction"] = auditAction;

        var requestBody = CaptureRequestBody(context);
        var controllerName = GetControllerName(context);

        var executedContext = await next();

        if (IsFailedResponse(executedContext))
        {
            var httpContext = context.HttpContext;
            var request = new WriteAuditLogRequest
            {
                UserId = httpContext.User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value ?? "",
                UserName = httpContext.User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "Unknown",
                Action = auditAction,
                EntityName = controllerName,
                EntityId = "",
                OldValues = "",
                NewValues = requestBody ?? "",
                IpAddress = httpContext.GetClientIp(),
                ServiceName = "CatalogService",
                IsSuccess = false,
                ErrorMessage = ExtractErrorMessage(executedContext) ?? "Unknown error"
            };

            var capturedClient = _auditClient;
            var capturedLogger = _logger;
            _ = Task.Run(async () =>
            {
                var retryPolicy = Policy
                    .Handle<RpcException>()
                    .WaitAndRetryAsync(
                        3,
                        attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                        (ex, ts, attempt, _) => capturedLogger.LogWarning(ex,
                            "Audit gRPC retry {Attempt}/3 for CatalogService/{Action}",
                            attempt, request.Action));
                try
                {
                    await retryPolicy.ExecuteAsync(() =>
                        capturedClient.WriteAuditLogAsync(request).ResponseAsync);
                }
                catch (Exception ex)
                {
                    capturedLogger.LogError(ex,
                        "AUDIT LOG LOST after 3 retries for CatalogService/{Action}/{Entity}",
                        request.Action, request.EntityName);
                }
            });
        }
    }

    private static string ResolveAction(string routeName, string httpMethod)
    {
        if (ActionMap.TryGetValue(routeName, out var mapped)) return mapped;
        if (routeName.Contains("delete", StringComparison.OrdinalIgnoreCase)) return "DELETE";
        if (routeName.Contains("insert", StringComparison.OrdinalIgnoreCase)) return "CREATE";
        if (routeName.Contains("update", StringComparison.OrdinalIgnoreCase)) return "UPDATE";
        return httpMethod switch { "POST" => "CREATE", "PUT" => "UPDATE", "DELETE" => "DELETE", _ => "UNKNOWN" };
    }

    private static bool IsFailedResponse(ActionExecutedContext ctx)
    {
        if (ctx.Exception != null && !ctx.ExceptionHandled) return true;
        if (ctx.Result is ObjectResult obj && obj.Value != null)
        {
            var t = obj.Value.GetType();
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(BaseResponse<>))
                return (bool?)t.GetProperty("Success")?.GetValue(obj.Value) == false;
            // Also handle non-generic BaseResponse just in case
            if (obj.Value is BaseResponse br) return !br.Success;
        }
        return ctx.Result is ForbidResult;
    }

    private static string? ExtractErrorMessage(ActionExecutedContext ctx)
    {
        if (ctx.Exception != null) return ctx.Exception.Message;
        if (ctx.Result is ObjectResult obj && obj.Value != null)
        {
            var t = obj.Value.GetType();
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(BaseResponse<>))
                return t.GetProperty("Message")?.GetValue(obj.Value)?.ToString();
            if (obj.Value is BaseResponse br) return br.Message;
        }
        if (ctx.Result is ForbidResult) return "Không có quyền thực hiện thao tác này";
        return null;
    }

    private static readonly HashSet<string> SensitiveFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password", "PasswordSalt", "Token", "RefreshToken",
        "CurrentPassword", "NewPassword", "ConfirmPassword"
    };

    private static string? CaptureRequestBody(ActionExecutingContext ctx)
    {
        if (ctx.ActionArguments.Count == 0) return null;
        try
        {
            var json = JsonSerializer.Serialize(ctx.ActionArguments);
            using var doc = JsonDocument.Parse(json);
            using var ms = new MemoryStream();
            using var writer = new Utf8JsonWriter(ms);
            WriteMasked(writer, doc.RootElement);
            writer.Flush();
            return Encoding.UTF8.GetString(ms.ToArray());
        }
        catch { return null; }
    }

    private static void WriteMasked(Utf8JsonWriter writer, JsonElement element, string? propertyName = null)
    {
        if (propertyName != null && SensitiveFields.Contains(propertyName))
        {
            writer.WriteStringValue("***MASKED***");
            return;
        }

        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var prop in element.EnumerateObject())
                {
                    writer.WritePropertyName(prop.Name);
                    WriteMasked(writer, prop.Value, prop.Name);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray())
                    WriteMasked(writer, item);
                writer.WriteEndArray();
                break;
            default:
                element.WriteTo(writer);
                break;
        }
    }

    private static string GetControllerName(ActionExecutingContext ctx)
        => ((ControllerActionDescriptor)ctx.ActionDescriptor).ControllerName;

    private static string GetRouteName(ActionExecutingContext ctx)
    {
        var d = ctx.ActionDescriptor as ControllerActionDescriptor;
        return d?.MethodInfo.GetCustomAttributes(typeof(RouteAttribute), false)
            .OfType<RouteAttribute>().FirstOrDefault()?.Template ?? d?.ActionName ?? "";
    }

}
