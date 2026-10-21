using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Common;
using Blocks.SystemService.Protos;
using Grpc.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Polly;

namespace Blocks.FileService.Infrastructure.Filters;

public class AuditActionFilter : IAsyncActionFilter
{
    private readonly AuditProto.AuditProtoClient _auditClient;
    private readonly ILogger<AuditActionFilter> _logger;

    private static readonly HashSet<string> AuditableMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "POST", "PUT", "DELETE"
    };

    // GET requests are already excluded by AuditableMethods; these are POST-based read-only endpoints
    private static readonly HashSet<string> SkipActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "get-list", "get-by-id"
    };

    private static readonly Dictionary<string, string> ActionMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // UploadFileController.Post has no [Route], so ActionName = "Post"
        { "Post", "UPLOAD_FILE" },
        { "upload", "UPLOAD_FILE" },
        { "delete-list", "DELETE_FILE" },
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
                NewValues = "",
                IpAddress = httpContext.GetClientIp(),
                ServiceName = "FileService",
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
                            "Audit gRPC retry {Attempt}/3 for FileService/{Action}",
                            attempt, request.Action));
                try
                {
                    await retryPolicy.ExecuteAsync(() => capturedClient.WriteAuditLogAsync(request).ResponseAsync);
                }
                catch (Exception ex)
                {
                    capturedLogger.LogError(ex,
                        "AUDIT LOG LOST after 3 retries for FileService/{Action}",
                        request.Action);
                }
            });
        }
        else
        {
            // Log successful uploads (action + user + IP — no body to capture since it's form data)
            var httpContext = context.HttpContext;
            var request = new WriteAuditLogRequest
            {
                UserId = httpContext.User?.Claims.FirstOrDefault(c => c.Type == "name")?.Value ?? "",
                UserName = httpContext.User?.Claims.FirstOrDefault(c => c.Type == "unique_name")?.Value ?? "Unknown",
                Action = auditAction,
                EntityName = controllerName,
                EntityId = "",
                OldValues = "",
                NewValues = "",
                IpAddress = httpContext.GetClientIp(),
                ServiceName = "FileService",
                IsSuccess = true,
                ErrorMessage = ""
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
                            "Audit gRPC retry {Attempt}/3 for FileService/{Action}",
                            attempt, request.Action));
                try
                {
                    await retryPolicy.ExecuteAsync(() => capturedClient.WriteAuditLogAsync(request).ResponseAsync);
                }
                catch (Exception ex)
                {
                    capturedLogger.LogError(ex,
                        "AUDIT LOG LOST after 3 retries for FileService/{Action}",
                        request.Action);
                }
            });
        }
    }

    private static string ResolveAction(string routeName, string httpMethod)
    {
        if (ActionMap.TryGetValue(routeName, out var mapped)) return mapped;
        if (routeName.Contains("delete", StringComparison.OrdinalIgnoreCase)) return "DELETE_FILE";
        if (routeName.Contains("upload", StringComparison.OrdinalIgnoreCase)) return "UPLOAD_FILE";
        return httpMethod switch { "POST" => "UPLOAD_FILE", "PUT" => "UPDATE", "DELETE" => "DELETE_FILE", _ => "UNKNOWN" };
    }

    private static bool IsFailedResponse(ActionExecutedContext ctx)
    {
        if (ctx.Exception != null && !ctx.ExceptionHandled) return true;
        if (ctx.Result is ObjectResult obj && obj.Value != null)
        {
            var t = obj.Value.GetType();
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(BaseResponse<>))
                return (bool?)t.GetProperty("Success")?.GetValue(obj.Value) == false;
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

    private static string GetControllerName(ActionExecutingContext ctx)
        => ((ControllerActionDescriptor)ctx.ActionDescriptor).ControllerName;

    private static string GetRouteName(ActionExecutingContext ctx)
    {
        var d = ctx.ActionDescriptor as ControllerActionDescriptor;
        return d?.MethodInfo.GetCustomAttributes(typeof(RouteAttribute), false)
            .OfType<RouteAttribute>().FirstOrDefault()?.Template ?? d?.ActionName ?? "";
    }

}
