using Blocks.Shared.DTOs.Base;
using Blocks.SystemService.Protos;
using Grpc.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.FileService.Infrastructure.Filters;

public interface IKnowledgeHubUploadPermissionClient
{
    Task<bool> CheckAddPermissionAsync(
        Guid actorId,
        string bearerToken,
        CancellationToken cancellationToken);
}

public sealed class SystemKnowledgeHubUploadPermissionClient : IKnowledgeHubUploadPermissionClient
{
    private readonly SystemProto.SystemProtoClient _client;
    private readonly double _timeoutSeconds;

    public SystemKnowledgeHubUploadPermissionClient(
        SystemProto.SystemProtoClient client,
        IConfiguration configuration)
    {
        _client = client;
        _timeoutSeconds = configuration.GetValue<double>(
            "FileService:KnowledgeHubPermissionTimeoutSeconds",
            3.0);

        if (!double.IsFinite(_timeoutSeconds) ||
            _timeoutSeconds <= 0 ||
            _timeoutSeconds > 10)
        {
            throw new InvalidOperationException(
                "FileService:KnowledgeHubPermissionTimeoutSeconds must be in (0, 10].");
        }
    }

    public async Task<bool> CheckAddPermissionAsync(
        Guid actorId,
        string bearerToken,
        CancellationToken cancellationToken)
    {
        var metadata = new Metadata
        {
            { "x-service-authorization", $"Bearer {bearerToken}" }
        };

        var response = await _client.CheckPermissionAsync(
            new CheckPermissionRequest
            {
                UserId = actorId.ToString("D"),
                Controller = "knowledgehub",
                Action = 2
            },
            headers: metadata,
            deadline: DateTime.UtcNow.AddSeconds(_timeoutSeconds),
            cancellationToken: cancellationToken);

        return response.Success;
    }
}

public interface IuploadAttemptAuditWriter
{
    Task WriteDeniedAsync(
        HttpContext context,
        Guid actorId,
        string safeMessage);
}

public sealed class SystemUploadAttemptAuditWriter : IuploadAttemptAuditWriter
{
    private readonly AuditProto.AuditProtoClient _client;
    private readonly ILogger<SystemUploadAttemptAuditWriter> _logger;

    public SystemUploadAttemptAuditWriter(AuditProto.AuditProtoClient client, ILogger<SystemUploadAttemptAuditWriter> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task WriteDeniedAsync(
        HttpContext context,
        Guid actorId,
        string safeMessage)
    {
        var request = new WriteAuditLogRequest
        {
            UserId = actorId.ToString("D"),
            UserName = context.User.FindFirst("unique_name")?.Value ?? "Unknown",
            Action = "UPLOAD_FILE",
            EntityName = "UploadFile",
            EntityId = string.Empty,
            OldValues = string.Empty,
            NewValues = string.Empty,
            IpAddress = context.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            ServiceName = "FileService",
            IsSuccess = false,
            ErrorMessage = safeMessage
        };

        try
        {
            await _client.WriteAuditLogAsync(
                request,
                deadline: DateTime.UtcNow.AddSeconds(2),
                cancellationToken: CancellationToken.None).ResponseAsync;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Could not write denied KnowledgeHub upload audit event.");
        }
    }
}

public sealed class KnowledgeHubUploadPermissionFilter : IAsyncAuthorizationFilter
{
    public const string PurposeHeader = "X-Upload-Purpose";
    public const string PurposeValue = "KnowledgeHubDocument";
    public const string ValidatedPurposeItem = "ValidatedUploadPurpose";

    private readonly IKnowledgeHubUploadPermissionClient _permissionClient;
    private readonly IuploadAttemptAuditWriter _auditWriter;
    private readonly ILogger<KnowledgeHubUploadPermissionFilter> _logger;

    public KnowledgeHubUploadPermissionFilter(
        IKnowledgeHubUploadPermissionClient permissionClient,
        IuploadAttemptAuditWriter auditWriter,
        ILogger<KnowledgeHubUploadPermissionFilter> logger)
    {
        _permissionClient = permissionClient;
        _auditWriter = auditWriter;
        _logger = logger;
    }

    public async Task OnAuthorizationAsync(
        AuthorizationFilterContext context)
    {
        var http = context.HttpContext;
        var purpose = http.Request.Headers[PurposeHeader].ToString();

        if (string.IsNullOrEmpty(purpose)) return;

        if (!string.Equals(purpose, PurposeValue, StringComparison.Ordinal))
        {
            context.Result = Error(400, "Upload purpose không được hỗ trợ");
            return;
        }

        if (http.User.Identity?.IsAuthenticated != true)
        {
            context.Result = Error(401, "Xác thực không thành công");
            return;
        }

        var actorText = http.User.FindFirst("name")?.Value;
        if (string.IsNullOrWhiteSpace(actorText) || actorText.Length != 36 || !Guid.TryParseExact(actorText, "D", out var actorId) ||
            actorId == Guid.Empty)
        {
            context.Result = Error(401, "Định danh người dùng không hợp lệ");
            return;
        }

        var authorization = http.Request.Headers.Authorization.ToString();
        if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Result = Error(401, "Xác thực không thành công");
            return;
        }

        var token = authorization["Bearer ".Length..].Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            context.Result = Error(401, "Xác thực không thành công");
            return;
        }

        try
        {
            var allowed = await _permissionClient.CheckAddPermissionAsync(
                actorId,
                token,
                http.RequestAborted);

            if (!allowed)
            {
                await _auditWriter.WriteDeniedAsync(
                    http,
                    actorId,
                    "KnowledgeHub ADD permission denied");

                context.Result = Error(
                    403,
                    "Bạn không có quyền tải tài liệu lên KnowledgeHub");
                return;
            }
            http.Items[ValidatedPurposeItem] = PurposeValue;
        }
        catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (RpcException ex)
        {
            var (status, message) = ex.StatusCode switch
            {
                StatusCode.Unauthenticated =>
                    (401, "Xác thực không thành công"),
                StatusCode.PermissionDenied =>
                    (403, "Bạn không có quyền truy cập"),
                _ =>
                    (503, "Dịch vụ kiểm tra quyền tạm thời không khả dụng")
            };

            await _auditWriter.WriteDeniedAsync(http, actorId, message);
            context.Result = Error(status, message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "KnowledgeHub upload permission check failed closed.");

            await _auditWriter.WriteDeniedAsync(
                http,
                actorId,
                "KnowledgeHub permission service unavailable");

            context.Result = Error(
                503,
                "Dịch vụ kiểm tra quyền tạm thời không khả dụng");
        }
    }

    private static IActionResult Error(int statusCode, string message) => new ObjectResult(new BaseResponse
    (
        false, statusCode, message
    ));
}