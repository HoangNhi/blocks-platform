using System.Text;
using System.Text.Json;
using Blocks.Shared.Common;
using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Entities;
using Blocks.SystemService.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.SystemService.Infrastructure.Filters;

public class AuditActionFilter : IAsyncActionFilter
{
    private readonly IAuditLogWriter _auditWriter;
    private readonly ILogger<AuditActionFilter> _logger;

    private static readonly HashSet<string> AuditableMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "POST", "PUT", "DELETE"
    };

    // Read-only endpoints that use POST (paging) — skip these
    private static readonly HashSet<string> SkipActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "get-list", "get-by-id", "get-current-user", "get-all-combobox",
        "get-all-not-parent-combobox", "get-all", "get-list-by-user",
        "get-permissions-by-role", "get-permissions-by-user",
        "login", "refresh-token", "get-entity-names"
    };

    // Route name → contextual audit action
    private static readonly Dictionary<string, string> ActionMap = new(StringComparer.OrdinalIgnoreCase)
    {
        { "insert", "CREATE" },
        { "update", "UPDATE" },
        { "delete-list", "DELETE" },
        { "edit-profile", "EDIT_PROFILE" },
        { "change-password", "CHANGE_PASSWORD" },
        { "update-permissions", "UPDATE_PERMISSIONS" },
        { "approve", "APPROVE" },
        { "submit-to-approve", "SUBMIT_TO_APPROVE" },
        { "change-status", "CHANGE_STATUS" },
        { "insert-with-evidence", "CREATE" },
        { "reuse-verified-evidence", "REUSE_EVIDENCE" },
        { "add-all-stakeholder-to-campaign", "ADD_STAKEHOLDERS" },
        { "add-list-stakeholder-to-campaign", "ADD_STAKEHOLDERS" },
        { "delete-list-session", "DELETE_SESSION" },
        { "send-survey-invitation", "SEND_INVITATION" },
        { "submit-survey", "SUBMIT_SURVEY" },
    };

    public AuditActionFilter(IAuditLogWriter auditWriter, ILogger<AuditActionFilter> logger)
    {
        _auditWriter = auditWriter;
        _logger = logger;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var httpMethod = context.HttpContext.Request.Method;

        if (!AuditableMethods.Contains(httpMethod))
        {
            await next();
            return;
        }

        var routeName = GetRouteName(context);

        if (SkipActions.Contains(routeName))
        {
            await next();
            return;
        }

        // 1. Resolve the contextual action name
        var auditAction = ResolveAction(routeName, httpMethod);

        // 2. Store in HttpContext.Items so the AuditInterceptor (Layer 1) can read it
        context.HttpContext.Items["AuditAction"] = auditAction;

        // 3. Capture request data BEFORE execution
        var requestBody = CaptureRequestBody(context);
        var controllerName = GetControllerName(context);

        // 4. Execute the action
        var executedContext = await next();

        // 5. After execution: only log if the operation FAILED
        //    (Successful operations are logged by the AuditInterceptor with Old/New values)
        if (IsFailedResponse(executedContext))
        {
            var errorMessage = ExtractErrorMessage(executedContext);
            var httpContext = context.HttpContext;

            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                UserId = GetUserId(httpContext),
                UserName = GetUserName(httpContext),
                Action = auditAction,
                EntityName = controllerName,
                EntityId = null,
                OldValues = null,
                NewValues = requestBody,
                IpAddress = httpContext.GetClientIp(),
                ServiceName = "SystemService",
                IsSuccess = false,
                ErrorMessage = errorMessage,
                CreatedAt = DateTime.UtcNow
            };

            await _auditWriter.WriteAsync(auditLog);
        }
    }

    private static string ResolveAction(string routeName, string httpMethod)
    {
        if (ActionMap.TryGetValue(routeName, out var mapped))
            return mapped;

        // Fallback: derive from route name pattern
        if (routeName.Contains("delete", StringComparison.OrdinalIgnoreCase)) return "DELETE";
        if (routeName.Contains("approve", StringComparison.OrdinalIgnoreCase)) return "APPROVE";
        if (routeName.Contains("reject", StringComparison.OrdinalIgnoreCase)) return "REJECT";
        if (routeName.Contains("submit", StringComparison.OrdinalIgnoreCase)) return "SUBMIT";
        if (routeName.Contains("insert", StringComparison.OrdinalIgnoreCase)) return "CREATE";
        if (routeName.Contains("update", StringComparison.OrdinalIgnoreCase)) return "UPDATE";
        if (routeName.Contains("change", StringComparison.OrdinalIgnoreCase)) return "UPDATE";

        return httpMethod switch
        {
            "POST" => "CREATE",
            "PUT" => "UPDATE",
            "DELETE" => "DELETE",
            _ => "UNKNOWN"
        };
    }

    private static bool IsFailedResponse(ActionExecutedContext context)
    {
        if (context.Exception != null && !context.ExceptionHandled)
            return true;

        if (context.Result is ObjectResult objResult && objResult.Value != null)
        {
            var valueType = objResult.Value.GetType();

            // Check BaseResponse<T>
            if (valueType.IsGenericType && valueType.GetGenericTypeDefinition() == typeof(BaseResponse<>))
            {
                var successProp = valueType.GetProperty("Success");
                if (successProp != null)
                    return (bool?)successProp.GetValue(objResult.Value) == false;
            }

            // Check non-generic BaseResponse
            if (objResult.Value is BaseResponse baseResponse)
                return !baseResponse.Success;
        }

        if (context.Result is ForbidResult)
            return true;

        return false;
    }

    private static string? ExtractErrorMessage(ActionExecutedContext context)
    {
        if (context.Exception != null)
            return context.Exception.Message;

        if (context.Result is ObjectResult objResult && objResult.Value != null)
        {
            var valueType = objResult.Value.GetType();

            if (valueType.IsGenericType && valueType.GetGenericTypeDefinition() == typeof(BaseResponse<>))
                return valueType.GetProperty("Message")?.GetValue(objResult.Value)?.ToString();

            if (objResult.Value is BaseResponse baseResponse)
                return baseResponse.Message;
        }

        if (context.Result is ForbidResult)
            return "Không có quyền thực hiện thao tác này";

        return "Unknown error";
    }

    private static readonly HashSet<string> SensitiveFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password", "PasswordSalt", "Token", "RefreshToken",
        "CurrentPassword", "NewPassword", "ConfirmPassword"
    };

    private static string? CaptureRequestBody(ActionExecutingContext context)
    {
        if (context.ActionArguments.Count == 0) return null;
        try
        {
            var json = JsonSerializer.Serialize(context.ActionArguments);
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

    private static string GetControllerName(ActionExecutingContext context)
    {
        return ((ControllerActionDescriptor)context.ActionDescriptor).ControllerName;
    }

    private static string GetRouteName(ActionExecutingContext context)
    {
        var descriptor = context.ActionDescriptor as ControllerActionDescriptor;
        var routeAttr = descriptor?.MethodInfo
            .GetCustomAttributes(typeof(RouteAttribute), false)
            .OfType<RouteAttribute>()
            .FirstOrDefault();
        return routeAttr?.Template ?? descriptor?.ActionName ?? "";
    }

    private static Guid GetUserId(HttpContext httpContext)
    {
        var claim = httpContext.User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value;
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }

    private static string GetUserName(HttpContext httpContext)
    {
        return httpContext.User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "Unknown";
    }

}
