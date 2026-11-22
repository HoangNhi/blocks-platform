# KnowledgeHub P03 - Code-First Implementation Plan

> **Cách sử dụng:** Đây là tài liệu implementation duy nhất cho toàn bộ P03. Mỗi task có vị trí file, đoạn source hiện tại để tìm, code đích để chép, thứ tự thay thế/chèn và lệnh kiểm thử. Owner tự chép code vào source, tự chạy test và review diff.

**Goal:** Hoàn thiện document lifecycle trong KnowledgeHub: upload PDF/Markdown/TXT, lưu original qua FileService, đăng ký metadata trong PostgreSQL, repository list/search/filter/paging, download và logical delete.

**Architecture:** FileService là nơi duy nhất giữ bytes; KnowledgeHub FastAPI giữ metadata và kiểm tra quyền sở hữu collection; React dùng Gateway và các shadcn/Radix primitives đã có. P03 không triển khai parsing, embeddings, worker hoặc content search.

**Tech Stack:** .NET 10/C#, ASP.NET Core MVC, gRPC-Web, Python 3.12, FastAPI, Pydantic v2, SQLAlchemy async, PostgreSQL, grpc.aio, Aspire, React 19, TypeScript, TanStack Query v5, Axios, Vitest.

**Spec:** docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md (ACCEPTED 2026-11-21).

**Source branch:** feature/knowledgehub-learning. Source files below were inspected on this branch when this plan was prepared. Before copying any patch, run git status and verify the file has not changed.

## 0. Quy tắc đọc và chép code

### 0.1. Quy ước trong tài liệu

| Nhãn | Ý nghĩa |
| --- | --- |
| **CREATE – FULL FILE** | Tạo file mới và chép toàn bộ code trong block vào file. |
| **MODIFY – REPLACE METHOD** | Tìm method được chỉ định trong source hiện tại, thay toàn bộ method bằng code trong block. |
| **MODIFY – INSERT** | Chèn block vào đúng vị trí được chỉ định; giữ nguyên code còn lại. |
| **MODIFY – REPLACE FILE** | Thay toàn bộ nội dung file bằng code trong block. |
| **GENERATED** | Sinh file bằng command; không tự viết hoặc chỉnh descriptor thủ công. |
| **OWNER GATE** | Dừng lại, cần owner review/authorization riêng trước khi thực hiện. |

Không chép code từ một task nếu task prerequisite chưa hoàn thành. Các tên class/function ở task sau phải khớp contract được định nghĩa ở task trước.

### 0.2. Những điều tuyệt đối không làm

- Không apply SQL, tạo database/schema test, đổi role/grant/menu/permission, deploy, start worker hoặc đụng đến dữ liệu thật nếu chưa có authorization riêng.
- Không chạy create_all(), Alembic bootstrap, startup DDL hoặc migration tự động.
- Không lưu JWT vào DB, manifest, log, sessionStorage hay localStorage.
- Không trả file_id, storage_key, SHA256, local path hoặc gRPC metadata ra public DTO.
- Không để browser gọi trực tiếp private FileService gRPC hoặc Python port.
- Không xóa original file khi collection bị soft-delete.
- Không cài shadcn, chạy shadcn CLI, thêm dependency hoặc sửa generic UI primitive.
- Không thêm READY, parsing progress, page count, chunk count, embeddings hoặc content search vào P03.
- Owner là người viết product code và SQL.

### 0.3. Thứ tự tổng thể

| Bước | Workstream | Chỉ chuyển bước khi |
| --- | --- | --- |
| 0 | Preflight | Đã đọc AGENTS.md, spec, branch, HEAD và local changes. |
| A | FileService | Build và DB-free regression harness đạt; stage ADD permission chạy trước MVC multipart model binding. |
| B1 | SQL draft | SQL đã được review và commit; dừng trước khi apply nếu chưa có authorization. |
| B2 | Python Backend | FileServiceClient, DB-free SQL/endpoint tests và API contract hoàn thành. |
| C | React | API/hooks/components/tests/build/lint hoàn thành với mock API. |
| I | Integration | Owner-authorized runtime test, DB test và visual review có bằng chứng thực tế. |

### 0.4. Preflight – chạy trước khi chép code

~~~powershell
git status --short
git branch --show-current
git rev-parse HEAD
~~~

Kết quả cần kiểm tra:
- Branch là feature/knowledgehub-learning.
- Ghi lại mọi modified/untracked file trước khi bắt đầu.
- Không reset, checkout hoặc overwrite thay đổi có sẵn.
- Đọc AGENTS.md và toàn bộ P03 specification.
- Source hiện tại là căn cứ; nếu source đã khác anchor trong plan, dừng và cập nhật patch trước khi chép.

---

# A. FileService – upload authorization, stage, finalize và storage

## A-00. File Map và thứ tự sửa

| Action | File | Code sẽ được chép/thay |
| --- | --- | --- |
| Modify | src/services/Blocks.FileService/Blocks.FileService.csproj | Thêm Protobuf client entry cho system.proto. |
| Modify | src/services/Blocks.FileService/Configs/ConfigService.cs | Đăng ký SystemProto client, permission filter, permission checker và audit writer. |
| Modify | src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs | Bỏ fallback JWT key; bắt buộc issuer, audience, key. |
| Modify | src/services/Blocks.FileService/Controllers/UploadFileController.cs | Gắn authorization filter cho Post, tăng multipart envelope 51 MiB, truyền purpose đã validate vào service. |
| Create | src/services/Blocks.FileService/Infrastructure/Filters/KnowledgeHubUploadPermissionFilter.cs | Full implementation: permission client, audit writer, MVC authorization filter. |
| Modify | src/services/Blocks.FileService/Services/CoreFeature/UploadFile/IUploadFileService.cs | Thêm purpose-aware Insert và UploadDataWithMetadataAsync. |
| Create | src/services/Blocks.FileService/DTOs/CoreFeature/UploadFile/FinalizedAttachment.cs | DTO nội bộ giữ ModelAttachment và trusted SHA256. |
| Modify | src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs | Thêm Purpose nullable vào manifest và validate Document target. |
| Modify | src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs | Thêm parser cho KnowledgeHub/Documents key. |
| Modify | src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs | Thay Insert, thêm stage retry idempotency, thay finalize bằng metadata method, mở rộng receipt hash. |
| Modify | src/services/Blocks.FileService/Protos/file.proto | Thêm source_sha256 = 9. |
| Modify | src/services/Blocks.FileService/Services/gRPC/FileGrpcService.cs | Trả SHA256 trong protobuf response. |
| Modify | src/platform/Blocks.AppHost/AppHost.cs | Cấu hình GrpcClients:SystemService bằng internal HTTPS endpoint. |
| Create | test/FileService.RemovalChecks/KnowledgeHubUploadPermissionChecks.cs | DB-free permission/no-write tests. |
| Modify | test/FileService.RemovalChecks/Program.cs | Thêm permissions mode. |
| Modify | test/FileService.RemovalChecks/UpgradeChecks.cs | Kiểm tra 51 MiB envelope và protobuf field 9. |

## A-01. Generate SystemProto client

**File:** src/services/Blocks.FileService/Blocks.FileService.csproj

Source hiện tại có:

~~~xml
<ItemGroup>
  <Protobuf Include="Protos\file.proto" GrpcServices="Server" />
  <Protobuf Include="..\Blocks.SystemService\Protos\audit.proto" GrpcServices="Client" Link="Protos\audit.proto" />
</ItemGroup>
~~~

**MODIFY – INSERT:** thêm dòng system.proto ngay dưới audit.proto. Giữ nguyên hai dòng đang có.

~~~xml
<Protobuf Include="..\Blocks.SystemService\Protos\system.proto" GrpcServices="Client" Link="Protos\system.proto" />
~~~

Sau khi sửa, ItemGroup phải là:

~~~xml
<ItemGroup>
  <Protobuf Include="Protos\file.proto" GrpcServices="Server" />
  <Protobuf Include="..\Blocks.SystemService\Protos\audit.proto" GrpcServices="Client" Link="Protos\audit.proto" />
  <Protobuf Include="..\Blocks.SystemService\Protos\system.proto" GrpcServices="Client" Link="Protos\system.proto" />
</ItemGroup>
~~~

**Kết quả cần có:** generated type Blocks.SystemService.Protos.SystemProto.SystemProtoClient và method CheckPermissionAsync.

~~~powershell
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
~~~

Không copy system.proto sang FileService. Không sửa file sinh trong obj/.

## A-02. Tạo permission filter và các dependency

**CREATE – FULL FILE:** src/services/Blocks.FileService/Infrastructure/Filters/KnowledgeHubUploadPermissionFilter.cs

File này gồm bốn phần:
1. IKnowledgeHubUploadPermissionClient: abstraction để test mà không gọi SystemService thật.
2. SystemKnowledgeHubUploadPermissionClient: gọi SystemProto.CheckPermission với per-call JWT metadata.
3. IUploadAttemptAuditWriter/SystemUploadAttemptAuditWriter: ghi audit khi authorization filter short-circuit.
4. KnowledgeHubUploadPermissionFilter: kiểm tra header và ADD trước MVC model binding.

~~~csharp
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

public sealed class SystemKnowledgeHubUploadPermissionClient
    : IKnowledgeHubUploadPermissionClient
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
            { "x-service-authorization", "Bearer " + bearerToken }
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

public interface IUploadAttemptAuditWriter
{
    Task WriteDeniedAsync(
        HttpContext context,
        Guid actorId,
        string safeMessage);
}

public sealed class SystemUploadAttemptAuditWriter : IUploadAttemptAuditWriter
{
    private readonly AuditProto.AuditProtoClient _client;
    private readonly ILogger<SystemUploadAttemptAuditWriter> _logger;

    public SystemUploadAttemptAuditWriter(
        AuditProto.AuditProtoClient client,
        ILogger<SystemUploadAttemptAuditWriter> logger)
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
    private readonly IUploadAttemptAuditWriter _auditWriter;
    private readonly ILogger<KnowledgeHubUploadPermissionFilter> _logger;

    public KnowledgeHubUploadPermissionFilter(
        IKnowledgeHubUploadPermissionClient permissionClient,
        IUploadAttemptAuditWriter auditWriter,
        ILogger<KnowledgeHubUploadPermissionFilter> logger)
    {
        _permissionClient = permissionClient;
        _auditWriter = auditWriter;
        _logger = logger;
    }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var http = context.HttpContext;
        var purpose = http.Request.Headers[PurposeHeader].ToString();

        if (string.IsNullOrEmpty(purpose))
            return;

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
        if (string.IsNullOrWhiteSpace(actorText) ||
            actorText.Length != 36 ||
            !Guid.TryParseExact(actorText, "D", out var actorId) ||
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

    private static IActionResult Error(int statusCode, string message)
        => new OkObjectResult(new BaseResponse(false, statusCode, message));
}
~~~

**Lưu ý:** code filter không truy cập Request.Form, không đọc IFormFile và không tin actor ID từ body. Nó chỉ đặt ValidatedUploadPurpose sau khi SystemService trả success=true.

## A-03. Đăng ký permission client và filter trong ConfigService

**File:** src/services/Blocks.FileService/Configs/ConfigService.cs

Source hiện tại đã có AddGrpcClient<AuditProto.AuditProtoClient>, HTTP/1.1 exact version và GrpcWebHandler.

**MODIFY – INSERT:** ngay sau block đăng ký AuditProto client, chép:

~~~csharp
builder.Services.AddGrpcClient<SystemProto.SystemProtoClient>(o =>
{
    var address = builder.Configuration["GrpcClients:SystemService"];
    if (string.IsNullOrWhiteSpace(address))
    {
        throw new InvalidOperationException(
            "GrpcClients:SystemService is required for FileService.");
    }

    o.Address = new Uri(address, UriKind.Absolute);
})
.ConfigureChannel(o =>
{
    o.HttpVersion = new Version(1, 1);
    o.HttpVersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
})
.ConfigurePrimaryHttpMessageHandler(() =>
    new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()));

builder.Services.AddScoped<
    IKnowledgeHubUploadPermissionClient,
    SystemKnowledgeHubUploadPermissionClient>();
builder.Services.AddScoped<
    IUploadAttemptAuditWriter,
    SystemUploadAttemptAuditWriter>();
builder.Services.AddScoped<KnowledgeHubUploadPermissionFilter>();
~~~

Thêm using Blocks.FileService.Infrastructure.Filters; nếu namespace filter chưa được import. Giữ nguyên AuditProto client. Không thêm public Gateway route cho SystemProto.

## A-04. Bỏ fallback JWT key

**File:** src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs

Tìm dòng hiện tại đang dùng default_key_for_test_if_missing.

**MODIFY – INSERT:** đầu ExecuteConfigAuthentication, trước AddAuthentication:

~~~csharp
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];
var jwtKey = builder.Configuration["Jwt:Key"];

if (string.IsNullOrWhiteSpace(jwtIssuer) ||
    string.IsNullOrWhiteSpace(jwtAudience) ||
    string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException(
        "FileService requires configured Jwt:Issuer, Jwt:Audience, and Jwt:Key.");
}
~~~

**MODIFY – REPLACE** trong TokenValidationParameters:

~~~csharp
ValidIssuer = jwtIssuer,
ValidAudience = jwtAudience,
IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
~~~

Không để fallback key. Trước runtime integration, owner phải xác nhận JWT issuer/audience/key của FileService khớp SystemService mà không in secret ra console.

## A-05. Gắn filter vào UploadFileController và tăng multipart envelope

**File:** src/services/Blocks.FileService/Controllers/UploadFileController.cs

Tìm Post hiện tại có RequestSizeLimit(52428800) và RequestFormLimits(MultipartBodyLengthLimit = 52428800).

**MODIFY – REPLACE METHOD:** thay toàn bộ Post bằng:

~~~csharp
[HttpPost]
[ServiceFilter(typeof(KnowledgeHubUploadPermissionFilter))]
[RequestSizeLimit(53477376)] // 51 MiB multipart envelope
[RequestFormLimits(MultipartBodyLengthLimit = 53477376)]
public async Task<IActionResult> Post(
    List<IFormFile> files,
    [FromForm] string FolderName)
{
    var purpose = HttpContext.Items.TryGetValue(
        KnowledgeHubUploadPermissionFilter.ValidatedPurposeItem,
        out var value)
        ? value as string
        : null;

    await _service.Insert(
        files,
        FolderName,
        HttpContext.RequestAborted,
        purpose);

    return Ok(new BaseResponse(true, 200));
}
~~~

Không thêm UploadPurpose vào FromForm. 51 MiB chỉ là request envelope; FileStorage.MaxFileBytes vẫn là 52,428,800 bytes (50 MiB).

## A-06. Cập nhật IUploadFileService và tạo FinalizedAttachment

**File:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/IUploadFileService.cs

**MODIFY – REPLACE FILE:** chép:

~~~csharp
using Blocks.Shared.DTOs.Base;
using Blocks.FileService.DTOs.Common;
using Blocks.FileService.DTOs.CoreFeature.UploadFile;

namespace Blocks.FileService.Services.CoreFeature.UploadFile
{
    public interface IUploadFileService
    {
        Task Insert(
            List<IFormFile> files,
            string FolderName,
            CancellationToken cancellationToken = default,
            string? uploadPurpose = null);

        Task<List<ModelAttachment>> UploadDataAsync(
            string relatedId,
            string servicePath,
            string folderName,
            string tempFolder,
            CancellationToken cancellationToken = default);

        Task<List<FinalizedAttachment>> UploadDataWithMetadataAsync(
            string relatedId,
            string servicePath,
            string folderName,
            string tempFolder,
            CancellationToken cancellationToken = default);

        Task<bool> DeleteDataAsync(
            IEnumerable<string> filePaths,
            CancellationToken cancellationToken = default);

        Task<string> UploadAvatarAsync(
            string folderUploadId,
            CancellationToken cancellationToken = default);

        Task<ModelFilePreview> PreviewFileAsync(
            string fileUrl,
            CancellationToken cancellationToken = default);

        Task<ModelFilePreview> PreviewAvatarAsync(
            string fileName,
            CancellationToken cancellationToken = default);
    }
}
~~~

**CREATE – FULL FILE:** src/services/Blocks.FileService/DTOs/CoreFeature/UploadFile/FinalizedAttachment.cs

~~~csharp
using Blocks.Shared.DTOs.Base;

namespace Blocks.FileService.DTOs.CoreFeature.UploadFile;

public sealed record FinalizedAttachment(
    ModelAttachment Attachment,
    string SourceSha256);
~~~

## A-07. Thêm Purpose vào manifest và validate target

**File:** src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs

Tìm record UploadSession hiện tại và thêm optional parameter ở cuối:

~~~csharp
public record UploadSession(
    Guid ActorId,
    Guid FolderId,
    Guid BatchId,
    DateTimeOffset CreatedAt,
    string State,
    List<StoredUploadFile> Files,
    UploadTarget? Target,
    List<ModelAttachment>? Result,
    string? Purpose = null);
~~~

Purpose default null để manifest cũ không có property này vẫn được đọc.

**MODIFY – REPLACE METHOD:** thay ValidateSessionShape bằng logic dưới đây. Giữ nguyên ReadAsync và WriteAsync hiện tại.

~~~csharp
private static void ValidateSessionShape(UploadSession session)
{
    if (session.ActorId == Guid.Empty ||
        session.FolderId == Guid.Empty ||
        session.BatchId == Guid.Empty ||
        session.CreatedAt == default)
        throw new BusinessException("Manifest chứa định danh không hợp lệ", 409);

    if (session.State is not ("Staged" or "Finalizing" or "Finalized"))
        throw new BusinessException("Trạng thái phiên tải lên không hợp lệ", 409);

    if (session.Purpose != null &&
        session.Purpose != "KnowledgeHubDocument")
        throw new BusinessException("Purpose trong manifest không hợp lệ", 409);

    if (session.Files == null ||
        session.Files.Count == 0 ||
        session.Files.Any(f => f == null) ||
        session.Files.Select(f => f.Id).Distinct().Count() != session.Files.Count)
        throw new BusinessException("Danh sách tệp trong phiên không được rỗng", 409);

    if (session.Purpose == "KnowledgeHubDocument" && session.Files.Count != 1)
        throw new BusinessException("KnowledgeHub chỉ cho phép một tệp trong một phiên", 409);

    long totalBytes = 0;
    foreach (var file in session.Files)
    {
        if (file.Id == Guid.Empty ||
            string.IsNullOrWhiteSpace(file.OriginalName) ||
            string.IsNullOrWhiteSpace(file.Extension) ||
            file.OriginalName.IndexOfAny(new[] { '/', (char)92, ':' }) >= 0 ||
            file.OriginalName.Contains("..") ||
            file.OriginalName.Any(char.IsControl) ||
            file.Extension.Length < 2 ||
            file.Extension[0] != '.' ||
            file.Extension.Skip(1).Any(c => !char.IsAsciiLetterOrDigit(c)) ||
            !string.Equals(Path.GetExtension(file.OriginalName), file.Extension,
                StringComparison.OrdinalIgnoreCase))
            throw new BusinessException("Thông tin tệp trong phiên không hợp lệ", 409);

        if (session.Purpose == "KnowledgeHubDocument" &&
            file.Extension is not (".pdf" or ".md" or ".txt"))
            throw new BusinessException("Định dạng tệp KnowledgeHub không hợp lệ", 409);

        if (file.Length <= 0 || file.Length > FileStorage.MaxFileBytes)
            throw new BusinessException("Dung lượng tệp trong phiên không hợp lệ", 409);

        totalBytes += file.Length;
        if (totalBytes > FileStorage.MaxFileBytes)
            throw new BusinessException("Tổng dung lượng phiên vượt quá giới hạn", 409);

        if (string.IsNullOrWhiteSpace(file.Sha256) ||
            file.Sha256.Length != 64 ||
            !file.Sha256.All(Uri.IsHexDigit))
            throw new BusinessException("Mã băm tệp trong phiên không hợp lệ", 409);
    }

    if (session.State == "Staged")
    {
        if (session.Target != null || session.Result != null)
            throw new BusinessException("Phiên tạm không được có kết quả hoàn tất", 409);
        return;
    }

    var target = session.Target;
    if (target == null)
        throw new BusinessException("Mục tiêu phiên tải lên không hợp lệ", 409);

    var isAttachment =
        session.Purpose == null &&
        target.Kind == "Attachment" &&
        target.Service == "System" &&
        target.Module == "Attachments" &&
        target.RelatedId is Guid attachmentId &&
        attachmentId != Guid.Empty;

    var isAvatar =
        session.Purpose == null &&
        target.Kind == "Avatar" &&
        target.Service == "System" &&
        target.Module == "Avatar" &&
        target.RelatedId == null &&
        session.Files.Count == 1;

    var isKnowledgeHubDocument =
        session.Purpose == "KnowledgeHubDocument" &&
        target.Kind == "Document" &&
        target.Service == "KnowledgeHub" &&
        target.Module == "Documents" &&
        target.RelatedId is Guid documentId &&
        documentId != Guid.Empty &&
        session.Files.Count == 1;

    if (!isAttachment && !isAvatar && !isKnowledgeHubDocument)
        throw new BusinessException("Mục tiêu phiên tải lên không hợp lệ", 409);

    if (session.Result == null ||
        session.Result.Count != session.Files.Count ||
        session.Result.Any(r => r == null) ||
        session.Result.Select(r => r.Id).Distinct().Count() != session.Files.Count)
        throw new BusinessException("Kết quả phiên tải lên không hợp lệ", 409);

    foreach (var file in session.Files)
    {
        var item = session.Result.SingleOrDefault(r => r.Id == file.Id);

        var expectedKey = isAvatar
            ? $"System/Avatar/{file.Id:D}{file.Extension}"
            : isAttachment
                ? $"System/Attachments/{target.RelatedId:D}/{file.Id:D}{file.Extension}"
                : $"KnowledgeHub/Documents/{target.RelatedId:D}/{file.Id:D}{file.Extension}";

        if (item == null ||
            item.FileUrl != expectedKey ||
            item.RelatedId != (target.RelatedId ?? Guid.Empty) ||
            item.FileName != Path.GetFileNameWithoutExtension(file.OriginalName) ||
            item.FileExtension != file.Extension ||
            item.FileSize != file.Length)
            throw new BusinessException("Kết quả không khớp mục tiêu và lô tệp", 409);
    }
}
~~~

## A-08. Thêm KnowledgeHub/Documents vào FileStorage

**File:** src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs

Trong ResolveActiveKey, giữ nguyên các nhánh System/Avatar và System/Attachments. Chèn nhánh sau trước exception cuối cùng:

~~~csharp
if (segments.Length == 4 &&
    string.Equals(segments[0], "KnowledgeHub", StringComparison.Ordinal) &&
    string.Equals(segments[1], "Documents", StringComparison.Ordinal))
{
    var documentIdText = segments[2];
    if (documentIdText.Length != 36 ||
        !Guid.TryParseExact(documentIdText, "D", out var documentId) ||
        documentId == Guid.Empty ||
        documentId.ToString("D") != documentIdText)
        throw new BusinessException("DocumentId không hợp lệ", 400);

    var fileName = segments[3];
    ValidateFileNameWithGuid(fileName);

    var fileIdText = Path.GetFileNameWithoutExtension(fileName);
    var extension = Path.GetExtension(fileName);

    if (extension is not (".pdf" or ".md" or ".txt") ||
        fileIdText.Length != 36 ||
        !Guid.TryParseExact(fileIdText, "D", out var fileId) ||
        fileId == Guid.Empty ||
        fileId.ToString("D") != fileIdText)
        throw new BusinessException("KnowledgeHub file key không hợp lệ", 400);

    return Resolve(
        StorageArea.Files,
        "KnowledgeHub",
        "Documents",
        documentIdText,
        fileName);
}
~~~

Key có đúng bốn segment: KnowledgeHub / Documents / documentId / fileId.extension.

## A-09. Thay Insert bằng bản hỗ trợ purpose và retry idempotent

**File:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs

**MODIFY – INSERT:** thêm using ở đầu file hiện tại:

~~~csharp
using Blocks.FileService.DTOs.CoreFeature.UploadFile;
~~~

Source đã có using Blocks.FileService.DTOs.Common; giữ nguyên using đó.

Tìm Insert ở đầu class và thay toàn bộ method bằng:

~~~csharp
public async Task Insert(
    List<IFormFile> files,
    string FolderName,
    CancellationToken cancellationToken = default,
    string? uploadPurpose = null)
{
    const string knowledgeHubPurpose = "KnowledgeHubDocument";

    if (uploadPurpose is not null &&
        !string.Equals(uploadPurpose, knowledgeHubPurpose, StringComparison.Ordinal))
        throw new BusinessException("Upload purpose không được hỗ trợ", 400);

    if (files == null || files.Count == 0)
        throw new BusinessException("Danh sách tệp rỗng", 400);

    if (string.IsNullOrWhiteSpace(FolderName) ||
        FolderName.Length != 36 ||
        !Guid.TryParseExact(FolderName, "D", out var folderGuid) ||
        folderGuid == Guid.Empty)
        throw new BusinessException("Thư mục lưu trữ không hợp lệ", 400);

    var isKnowledgeHub = uploadPurpose == knowledgeHubPurpose;
    if (isKnowledgeHub && files.Count != 1)
        throw new BusinessException("KnowledgeHub chỉ cho phép tải lên một tệp mỗi lần", 400);

    var actorId = GetActorId();
    long declaredTotal = 0;

    foreach (var file in files)
    {
        if (file == null || file.Length <= 0)
            throw new BusinessException("Tệp tải lên không được rỗng", 400);

        declaredTotal += file.Length;
        if (declaredTotal > FileStorage.MaxFileBytes)
            throw new BusinessException("Tổng dung lượng tệp vượt quá giới hạn", 413);

        ValidateUploadFileName(file.FileName);
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();

        var validExtension = isKnowledgeHub
            ? ext is ".pdf" or ".md" or ".txt"
            : IsValidExtension(ext);

        if (!validExtension)
            throw new BusinessException("Định dạng tệp không được hỗ trợ", 400);
    }

    await _sessions.WriteGate.WaitAsync(cancellationToken);
    string? newBatchDir = null;

    try
    {
        var existingSession = await _sessions.ReadAsync(
            actorId,
            folderGuid,
            cancellationToken);

        if (isKnowledgeHub && existingSession != null)
        {
            var sameContent = await IsSameKnowledgeHubStageAsync(
                existingSession,
                files,
                cancellationToken);

            if (sameContent)
                return;

            throw new BusinessException(
                "UploadSessionId đã được sử dụng cho nội dung khác",
                409);
        }

        if (existingSession != null &&
            (existingSession.State == "Finalized" ||
             existingSession.State == "Finalizing"))
            throw new BusinessException(
                "Phiên tải lên đang hoặc đã hoàn tất không thể thay thế",
                409);

        var sessionDir = _storage.ResolveSession(actorId, folderGuid);
        Directory.CreateDirectory(sessionDir);

        var batchId = Guid.NewGuid();
        newBatchDir = _storage.Resolve(
            StorageArea.Temp,
            actorId.ToString("D"),
            folderGuid.ToString("D"),
            "batches",
            batchId.ToString("D"));

        Directory.CreateDirectory(newBatchDir);

        var storedFiles = new List<StoredUploadFile>();
        long totalBytesWritten = 0;

        foreach (var file in files)
        {
            var fileId = Guid.NewGuid();
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var physicalFileName = $"{fileId:D}{ext}";
            var targetFilePath = _storage.Resolve(
                StorageArea.Temp,
                actorId.ToString("D"),
                folderGuid.ToString("D"),
                "batches",
                batchId.ToString("D"),
                physicalFileName);

            long fileBytesWritten = 0;

            using (var inputStream = file.OpenReadStream())
            using (var outputStream = new FileStream(
                targetFilePath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None))
            {
                var buffer = new byte[81920];
                int bytesRead;

                while ((bytesRead = await inputStream.ReadAsync(
                    buffer, 0, buffer.Length, cancellationToken)) > 0)
                {
                    await outputStream.WriteAsync(
                        buffer, 0, bytesRead, cancellationToken);

                    fileBytesWritten += bytesRead;
                    totalBytesWritten += bytesRead;

                    if (totalBytesWritten > FileStorage.MaxFileBytes)
                        throw new BusinessException(
                            "Tổng dung lượng tệp vượt quá giới hạn", 413);
                }
            }

            if (fileBytesWritten == 0)
                throw new BusinessException("Tệp tải lên không được rỗng", 400);

            using var hashStream = File.OpenRead(targetFilePath);
            var hashBytes = await System.Security.Cryptography.SHA256.HashDataAsync(
                hashStream,
                cancellationToken);

            storedFiles.Add(new StoredUploadFile(
                fileId,
                file.FileName,
                ext,
                fileBytesWritten,
                Convert.ToHexString(hashBytes)));
        }

        var session = new UploadSession(
            actorId,
            folderGuid,
            batchId,
            DateTimeOffset.UtcNow,
            "Staged",
            storedFiles,
            null,
            null,
            uploadPurpose);

        await _sessions.WriteAsync(session, cancellationToken);
        newBatchDir = null;
    }
    catch
    {
        if (newBatchDir != null && Directory.Exists(newBatchDir))
        {
            try { Directory.Delete(newBatchDir, recursive: true); }
            catch { }
        }

        throw;
    }
    finally
    {
        _sessions.WriteGate.Release();
    }
}

private static async Task<bool> IsSameKnowledgeHubStageAsync(
    UploadSession existing,
    List<IFormFile> files,
    CancellationToken cancellationToken)
{
    if (existing.Purpose != "KnowledgeHubDocument" ||
        existing.Files.Count != 1 ||
        files.Count != 1)
        return false;

    var stored = existing.Files[0];
    var incoming = files[0];

    if (!string.Equals(stored.OriginalName, incoming.FileName, StringComparison.Ordinal) ||
        stored.Length != incoming.Length ||
        !string.Equals(
            stored.Extension,
            Path.GetExtension(incoming.FileName).ToLowerInvariant(),
            StringComparison.Ordinal))
        return false;

    using var input = incoming.OpenReadStream();
    var hash = Convert.ToHexString(
        await System.Security.Cryptography.SHA256.HashDataAsync(
            input,
            cancellationToken));

    return string.Equals(
        stored.Sha256,
        hash,
        StringComparison.OrdinalIgnoreCase);
}
~~~

**MODIFY – REPLACE METHOD:** ValidateUploadFileName thêm giới hạn 255 Unicode scalar values:

~~~csharp
private static void ValidateUploadFileName(string fileName)
{
    if (string.IsNullOrWhiteSpace(fileName))
        throw new BusinessException("Tên tệp không được rỗng", 400);

    if (fileName.Contains('/') ||
        fileName.Contains((char)92) ||
        fileName.Contains(':') ||
        fileName.Contains("..") ||
        fileName.Any(char.IsControl) ||
        fileName.EnumerateRunes().Count() > 255)
        throw new BusinessException(
            "Tên tệp chứa ký tự không hợp lệ hoặc quá dài",
            400);
}
~~~

Giữ nguyên IsValidExtension hiện tại để legacy upload không bị thu hẹp.

## A-10. Thay finalize bằng UploadDataWithMetadataAsync

**File:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs

Thay method UploadDataAsync hiện tại bằng wrapper và metadata method dưới đây. Wrapper giữ nguyên contract cũ cho các caller hiện tại.

~~~csharp
public async Task<List<ModelAttachment>> UploadDataAsync(
    string relatedId,
    string servicePath,
    string folderName,
    string tempFolder,
    CancellationToken cancellationToken = default)
{
    var finalized = await UploadDataWithMetadataAsync(
        relatedId,
        servicePath,
        folderName,
        tempFolder,
        cancellationToken);

    return finalized.Select(x => x.Attachment).ToList();
}

public async Task<List<FinalizedAttachment>> UploadDataWithMetadataAsync(
    string relatedId,
    string servicePath,
    string folderName,
    string tempFolder,
    CancellationToken cancellationToken = default)
{
    var isAttachment =
        string.Equals(servicePath, "System", StringComparison.OrdinalIgnoreCase) &&
        string.Equals(folderName, "Attachments", StringComparison.OrdinalIgnoreCase);

    var isKnowledgeHubDocument =
        string.Equals(servicePath, "KnowledgeHub", StringComparison.Ordinal) &&
        string.Equals(folderName, "Documents", StringComparison.Ordinal);

    if (!isAttachment && !isKnowledgeHubDocument)
        throw new BusinessException(
            "Mục tiêu lưu trữ không hợp lệ hoặc chưa được đăng ký", 400);

    if (string.IsNullOrWhiteSpace(relatedId) ||
        relatedId.Length != 36 ||
        !Guid.TryParseExact(relatedId, "D", out var relatedGuid) ||
        relatedGuid == Guid.Empty)
        throw new BusinessException("Mã liên kết không hợp lệ", 400);

    if (string.IsNullOrWhiteSpace(tempFolder) ||
        tempFolder.Length != 36 ||
        !Guid.TryParseExact(tempFolder, "D", out var folderGuid) ||
        folderGuid == Guid.Empty)
        throw new BusinessException("Thư mục lưu trữ tạm không hợp lệ", 400);

    var actorId = GetActorId();
    await _sessions.WriteGate.WaitAsync(cancellationToken);

    try
    {
        var session = await _sessions.ReadAsync(
            actorId,
            folderGuid,
            cancellationToken);

        if (session == null)
            throw new BusinessException("Phiên tải lên không tồn tại", 409);

        var expectedPurpose = isKnowledgeHubDocument
            ? "KnowledgeHubDocument"
            : null;

        if (session.Purpose != expectedPurpose)
            throw new BusinessException(
                "Upload purpose không khớp mục tiêu finalize", 409);

        if (isKnowledgeHubDocument && session.Files.Count != 1)
            throw new BusinessException(
                "KnowledgeHub chỉ cho phép một tệp", 409);

        var targetKind = isKnowledgeHubDocument ? "Document" : "Attachment";
        var targetService = isKnowledgeHubDocument ? "KnowledgeHub" : "System";
        var targetModule = isKnowledgeHubDocument ? "Documents" : "Attachments";

        if (session.Target != null &&
            (session.Target.Kind != targetKind ||
             session.Target.Service != targetService ||
             session.Target.Module != targetModule ||
             session.Target.RelatedId != relatedGuid))
            throw new BusinessException(
                "Phiên tải lên đã liên kết với mục tiêu khác", 409);

        string BuildKey(StoredUploadFile file) =>
            isKnowledgeHubDocument
                ? $"KnowledgeHub/Documents/{relatedGuid:D}/{file.Id:D}{file.Extension}"
                : $"System/Attachments/{relatedGuid:D}/{file.Id:D}{file.Extension}";

        if (session.State == "Finalized")
        {
            if (session.Target?.Kind != targetKind ||
                session.Target.RelatedId != relatedGuid ||
                session.Result == null ||
                session.Result.Count != session.Files.Count)
                throw new BusinessException(
                    "Kết quả phiên tải lên không khớp mục tiêu", 409);

            var completed = new List<FinalizedAttachment>();

            foreach (var item in session.Result)
            {
                var stored = session.Files.Single(f => f.Id == item.Id);
                if (!string.Equals(item.FileUrl, BuildKey(stored), StringComparison.Ordinal))
                    throw new BusinessException("Storage key không khớp manifest", 409);

                var path = _storage.ResolveActiveKey(item.FileUrl);
                if (!File.Exists(path))
                    throw new BusinessException(
                        "Tệp đã bị xóa hoặc không thể phục hồi", 409);

                await VerifyFileAsync(path, stored, cancellationToken);

                completed.Add(new FinalizedAttachment(
                    item,
                    stored.Sha256.ToLowerInvariant()));
            }

            return completed;
        }

        if (session.State == "Finalizing" &&
            (session.Target?.Kind != targetKind ||
             session.Target.RelatedId != relatedGuid))
            throw new BusinessException(
                "Phiên tải lên đang hoàn tất cho mục tiêu khác", 409);

        var batchDir = _storage.Resolve(
            StorageArea.Temp,
            actorId.ToString("D"),
            folderGuid.ToString("D"),
            "batches",
            session.BatchId.ToString("D"));

        if (!Directory.Exists(batchDir))
            throw new BusinessException(
                "Thư mục lô tệp không tồn tại", 404);

        var attachments = session.Files.Select(stored => new ModelAttachment
        {
            Id = stored.Id,
            RelatedId = relatedGuid,
            FileName = Path.GetFileNameWithoutExtension(stored.OriginalName),
            FileExtension = stored.Extension,
            FileSize = stored.Length,
            FileUrl = BuildKey(stored)
        }).ToList();

        if (session.State != "Finalizing")
        {
            session = session with
            {
                State = "Finalizing",
                Target = new UploadTarget(
                    targetKind,
                    targetService,
                    targetModule,
                    relatedGuid),
                Result = attachments
            };

            await _sessions.WriteAsync(session, cancellationToken);
        }

        foreach (var stored in session.Files)
        {
            var sourcePath = _storage.Resolve(
                StorageArea.Temp,
                actorId.ToString("D"),
                folderGuid.ToString("D"),
                "batches",
                session.BatchId.ToString("D"),
                $"{stored.Id:D}{stored.Extension}");

            if (!File.Exists(sourcePath))
                throw new BusinessException(
                    "Tệp nguồn trong phiên không tồn tại", 409);

            var destinationPath = isKnowledgeHubDocument
                ? _storage.Resolve(
                    StorageArea.Files,
                    "KnowledgeHub",
                    "Documents",
                    relatedGuid.ToString("D"),
                    $"{stored.Id:D}{stored.Extension}")
                : _storage.Resolve(
                    StorageArea.Files,
                    "System",
                    "Attachments",
                    relatedGuid.ToString("D"),
                    $"{stored.Id:D}{stored.Extension}");

            if (File.Exists(destinationPath))
            {
                await VerifyFileAsync(
                    destinationPath,
                    stored,
                    cancellationToken);
            }
            else
            {
                RejectDeletedTarget(BuildKey(stored));
                Directory.CreateDirectory(
                    Path.GetDirectoryName(destinationPath)!);
                File.Copy(sourcePath, destinationPath, overwrite: false);
                await VerifyFileAsync(
                    destinationPath,
                    stored,
                    cancellationToken);
            }
        }

        session = session with { State = "Finalized" };
        await _sessions.WriteAsync(session, cancellationToken);

        return attachments
            .Select(item => new FinalizedAttachment(
                item,
                session.Files.Single(f => f.Id == item.Id)
                    .Sha256.ToLowerInvariant()))
            .ToList();
    }
    finally
    {
        _sessions.WriteGate.Release();
    }
}
~~~

Không xóa source Temp trong method này. Nếu destination đã tồn tại thì VerifyFileAsync phải xác minh length và SHA256 trước khi trả success.

## A-11. Sửa ReceiptKeyHash để không nhầm namespace

**File:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs

Tìm ReceiptKeyHash hiện tại. Nó đang phân biệt chỉ bằng segment count và có thể biến key bốn segment thành System/Attachments.

**MODIFY – REPLACE METHOD:**

~~~csharp
private static string ReceiptKeyHash(string key)
{
    var segments = key.Split('/');
    string canonical;

    if (segments.Length == 3 &&
        segments[0] == "System" &&
        segments[1] == "Avatar")
    {
        canonical = $"System/Avatar/{segments[2]}";
    }
    else if (segments.Length == 4 &&
             segments[0] == "System" &&
             segments[1] == "Attachments")
    {
        canonical = $"System/Attachments/{segments[2]}/{segments[3]}";
    }
    else if (segments.Length == 4 &&
             segments[0] == "KnowledgeHub" &&
             segments[1] == "Documents")
    {
        canonical = $"KnowledgeHub/Documents/{segments[2]}/{segments[3]}";
    }
    else
    {
        throw new BusinessException(
            "Storage key không hợp lệ để tạo deletion receipt", 400);
    }

    var normalized = OperatingSystem.IsWindows()
        ? canonical.ToLowerInvariant()
        : canonical;

    return Convert.ToHexString(
        System.Security.Cryptography.SHA256.HashData(
            Encoding.UTF8.GetBytes(normalized)))
        .ToLowerInvariant();
}
~~~

Giữ RejectDeletedTarget và WriteDeleteReceiptAsync. Xác nhận DeleteDataAsync gọi ResolveActiveKey trước ReceiptKeyHash; source hiện tại đã làm như vậy.

## A-12. Thêm protobuf field 9 và mapping gRPC

**File:** src/services/Blocks.FileService/Protos/file.proto

Source hiện tại kết thúc ModelAttachmentProto ở field 8:

~~~protobuf
string full_file_name = 8;
~~~

**MODIFY – INSERT:** thêm ngay sau field 8:

~~~protobuf
string source_sha256 = 9;
~~~

Không đổi số field 1-8, không thêm RPC.

**File:** src/services/Blocks.FileService/Services/gRPC/FileGrpcService.cs

Trong UploadData, đổi lời gọi UploadDataAsync thành UploadDataWithMetadataAsync.

Trong foreach, item giờ là FinalizedAttachment. Thay mapping hiện tại bằng:

~~~csharp
var attachment = item.Attachment;
response.Attachments.Add(new ModelAttachmentProto
{
    Id = attachment.Id.ToString(),
    ReferenceType = attachment.ReferenceType,
    RelatedId = attachment.RelatedId.ToString(),
    FileName = attachment.FileName ?? string.Empty,
    FileExtension = attachment.FileExtension ?? string.Empty,
    FileSize = attachment.FileSize.HasValue ? attachment.FileSize.Value : null,
    FileUrl = attachment.FileUrl ?? string.Empty,
    FullFileName = attachment.FullFileName ?? string.Empty,
    SourceSha256 = item.SourceSha256
});
~~~

Không sửa mapping DeleteData, UploadAvatar hoặc PreviewFile.

## A-13. Cấu hình FileService gọi SystemService bằng HTTPS trong AppHost

**File:** src/platform/Blocks.AppHost/AppHost.cs

Source hiện tại:

~~~csharp
fileService.WithReference(systemService);
~~~

**MODIFY – REPLACE LINE:**

~~~csharp
fileService
    .WithReference(systemService)
    .WithEnvironment(
        "GrpcClients__SystemService",
        systemService.GetEndpoint("https"));
~~~

Biến GrpcClients__SystemService map sang GrpcClients:SystemService. Cùng endpoint được AuditProto và SystemProto dùng. Không thêm route vào Gateway. Owner phải xác nhận HTTPS certificate của SystemService được FileService tin cậy; không tắt certificate validation.

## A-14. Test FileService trước khi chuyển sang Python

**File:** test/FileService.RemovalChecks/Program.cs

Trong knownModes thêm permissions:

~~~csharp
"permissions",
~~~

Sau block mode lifecycle, thêm:

~~~csharp
if (mode is "permissions" or "all")
{
    await KnowledgeHubUploadPermissionChecks.RunAsync(CheckAsync);
}
~~~

**CREATE – TEST FILE:** test/FileService.RemovalChecks/KnowledgeHubUploadPermissionChecks.cs

Tạo fixture DB-free với fake IKnowledgeHubUploadPermissionClient và fake IUploadAttemptAuditWriter. Bắt buộc có các test sau:

| Test | Arrange | Assert |
| --- | --- | --- |
| LegacyNoPurpose | Không gửi X-Upload-Purpose | Không gọi permission client; legacy path tiếp tục. |
| UnknownPurpose | Header khác KnowledgeHubDocument | Envelope 400; action không chạy. |
| MissingActorClaim | Claim name thiếu/sai UUID | Envelope 401; không gọi permission client. |
| AddAllowed | Permission client trả true | Items[ValidatedUploadPurpose] đúng; action chạy. |
| AddDenied | Permission client trả false | Envelope 403; action không chạy; audit được gọi. |
| PermissionUnavailable | Fake ném RpcException UNAVAILABLE | Envelope 503; action không chạy; audit được gọi. |
| PermissionUnauthenticated | Fake ném UNAUTHENTICATED | Envelope 401; action không chạy. |
| PermissionTimeout | Fake ném DEADLINE_EXCEEDED | Envelope 503; action không chạy. |
| NoTempOnDenied | Test host với private temp root | Không có session directory, batch, file hoặc manifest. |
| SameSessionSameContent | Stage lại cùng session, filename, bytes | Acknowledge; manifest/batch cũ không bị thay. |
| SameSessionDifferentContent | Cùng session nhưng bytes khác | 409; batch cũ còn nguyên. |
| OldManifest | JSON manifest không có Purpose | Deserialize thành Purpose=null. |
| KnowledgeHubTarget | Finalize đúng Document/KnowledgeHub/Documents | Key đúng bốn segments, hash đúng. |
| WrongTarget | Manifest KH finalize vào System/Attachments hoặc ngược lại | 409. |
| DeleteReceipt | Delete key KH rồi retry finalize cùng key | 409, không tạo lại file. |
| LegacyRegression | Attachment và Avatar cũ | Tất cả test cũ vẫn pass. |

Trong UpgradeChecks.cs:
- RequestSizeLimit và MultipartBodyLengthLimit bằng 53,477,376.
- FileStorage.MaxFileBytes vẫn bằng 52,428,800.
- Assert ModelAttachmentProto field 1-8 không đổi.
- Assert source_sha256 field 9 tồn tại.
- Assert FileProto RPC method set không đổi.

~~~powershell
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
dotnet run --project test/FileService.RemovalChecks -- permissions
dotnet run --project test/FileService.RemovalChecks -- paths
dotnet run --project test/FileService.RemovalChecks -- sessions
dotnet run --project test/FileService.RemovalChecks -- lifecycle
dotnet run --project test/FileService.RemovalChecks -- transport
dotnet run --project test/FileService.RemovalChecks -- gateway
dotnet run --project test/FileService.RemovalChecks -- boundary
dotnet run --project test/FileService.RemovalChecks -- migration
dotnet run --project test/FileService.RemovalChecks -- upgrade
dotnet run --project test/FileService.RemovalChecks -- all
~~~

Không chuyển sang B nếu legacy Attachment/Avatar regression bị fail.



---

# B. KnowledgeHub Backend – PostgreSQL, FileServiceClient và API

## B-00. File Map

| Action | File | Code sẽ được chép/thay |
| --- | --- | --- |
| Create | docs/database/2026-11-21-knowledgehub-p03-documents.sql | Full database-first DDL cho public.documents. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/models.py | Thêm DocumentModel sau khi SQL được owner authorize/apply. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py | Thêm request/response schemas và DocumentCount mapping. |
| Generated | src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2.py | Sinh từ FileService file.proto. |
| Generated | src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2_grpc.py | Sinh từ FileService file.proto. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py | FileService HTTPS URL, CA và timeout. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/file_service.py | grpc.aio secure client, per-call JWT metadata, timeout, cancellation, status mapping. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/documents.py | SQL builders và document lifecycle repository. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/document_routes.py | Upload intent, finalize, list, detail, download, delete. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py | Lifespan, health, router và DocumentCount. |
| Modify | src/platform/Blocks.AppHost/AppHost.cs | KnowledgeHub -> FileService private HTTPS reference. |
| Modify | tests/test_config.py, test_proto_stubs.py, test_database.py, test_schemas.py, test_endpoints.py | Settings, proto, lifespan, schema, endpoint tests. |
| Create | tests/test_file_service.py | Mocked FileServiceClient tests. |
| Create | tests/test_documents.py | SQL compilation/owner predicate/lifecycle tests. |
| Create | tests/test_document_endpoints.py | FastAPI tests với mocked FileService. |

## B-01. Tạo SQL database-first

<badge color="warning">OWNER GATE</badge>

**CREATE – FULL FILE:** docs/database/2026-11-21-knowledgehub-p03-documents.sql

Đây là SQL draft. Chỉ tạo file và review; không chạy trên database khi chưa có authorization riêng.

~~~sql
-- Target Database: knowledgehub
-- Target Schema: public
-- Feature: KnowledgeHub P03 Documents
-- Status: PROPOSED - Review only. Do not apply without explicit owner authorization.
-- Privilege Impact: runtime role needs SELECT, INSERT, UPDATE. No DELETE.

CREATE OR REPLACE FUNCTION public.set_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL,
    upload_session_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_extension VARCHAR(10) NOT NULL,
    content_type VARCHAR(127) NOT NULL,
    declared_size_bytes BIGINT NOT NULL,
    file_id UUID NULL,
    storage_key TEXT NULL,
    size_bytes BIGINT NULL,
    source_sha256 CHAR(64) NULL,
    registration_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_UPLOAD',
    cleanup_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED',
    registration_attempt_id UUID NULL,
    registration_lease_until TIMESTAMPTZ NULL,
    last_error_code VARCHAR(64) NULL,
    last_error_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMPTZ NULL,
    deleted_at TIMESTAMPTZ NULL,

    CONSTRAINT fk_documents_collection
        FOREIGN KEY (collection_id)
        REFERENCES public.collections(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_documents_id_nonzero
        CHECK (id <> '00000000-0000-0000-0000-000000000000'::UUID),

    CONSTRAINT ck_documents_collection_id_nonzero
        CHECK (collection_id <> '00000000-0000-0000-0000-000000000000'::UUID),

    CONSTRAINT ck_documents_upload_session_nonzero
        CHECK (upload_session_id <> '00000000-0000-0000-0000-000000000000'::UUID),

    CONSTRAINT ck_documents_file_id_nonzero
        CHECK (
            file_id IS NULL OR
            file_id <> '00000000-0000-0000-0000-000000000000'::UUID
        ),

    CONSTRAINT ck_documents_attempt_id_nonzero
        CHECK (
            registration_attempt_id IS NULL OR
            registration_attempt_id <> '00000000-0000-0000-0000-000000000000'::UUID
        ),

    CONSTRAINT ck_documents_title_nonblank
        CHECK (length(btrim(title)) > 0),

    CONSTRAINT ck_documents_original_filename_nonblank
        CHECK (length(btrim(original_filename)) > 0),

    CONSTRAINT ck_documents_declared_size
        CHECK (declared_size_bytes > 0 AND declared_size_bytes <= 52428800),

    CONSTRAINT ck_documents_actual_size
        CHECK (
            size_bytes IS NULL OR
            (size_bytes > 0 AND size_bytes <= 52428800)
        ),

    CONSTRAINT ck_documents_extension
        CHECK (file_extension IN ('.pdf', '.md', '.txt')),

    CONSTRAINT ck_documents_sha256
        CHECK (
            source_sha256 IS NULL OR
            source_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT ck_documents_registration_status
        CHECK (
            registration_status IN (
                'AWAITING_UPLOAD',
                'REGISTERING',
                'REGISTRATION_FAILED',
                'REGISTERED',
                'BLOCKED_PARENT_DELETED',
                'PARENT_DELETED_RETAINED'
            )
        ),

    CONSTRAINT ck_documents_cleanup_status
        CHECK (
            cleanup_status IN (
                'NOT_REQUESTED',
                'PENDING',
                'COMPLETED',
                'FAILED'
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_upload_session
    ON public.documents(upload_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_file_id
    ON public.documents(file_id)
    WHERE file_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_storage_key
    ON public.documents(storage_key)
    WHERE storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_collection_active_created
    ON public.documents(collection_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_registration_recovery
    ON public.documents(registration_lease_until, updated_at)
    WHERE registration_status IN ('REGISTERING', 'REGISTRATION_FAILED');

CREATE INDEX IF NOT EXISTS idx_documents_cleanup_pending
    ON public.documents(updated_at)
    WHERE deleted_at IS NOT NULL
      AND cleanup_status IN ('PENDING', 'FAILED');

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_documents_updated_at();

-- Rollback comments only. Do not execute automatically.
-- DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
-- DROP INDEX IF EXISTS idx_documents_cleanup_pending;
-- DROP INDEX IF EXISTS idx_documents_registration_recovery;
-- DROP INDEX IF EXISTS idx_documents_collection_active_created;
-- DROP INDEX IF EXISTS uq_documents_storage_key;
-- DROP INDEX IF EXISTS uq_documents_file_id;
-- DROP INDEX IF EXISTS uq_documents_upload_session;
-- DROP TABLE IF EXISTS public.documents;
-- DROP FUNCTION IF EXISTS public.set_documents_updated_at();
~~~

**Review trước khi commit:**
- FK là ON DELETE RESTRICT, không cascade.
- Không có owner_id duplicate; owner được xác định qua collections.owner_id.
- Không có jobs/chunks/embeddings/vectors.
- SHA256 được lưu lowercase hex 64 ký tự.
- Partial index predicate phải khớp query predicate.
- Không thêm GRANT khi chưa biết runtime DB role thực tế.
- Không có DSN/password/secret.

**OWNER GATE:** dừng sau khi commit SQL draft. Chỉ apply sau khi owner nêu rõ target database và operation được phép. P00 không cho phép tạo test database riêng; không dùng database ứng dụng làm test DB.

## B-02. Thêm DocumentModel sau khi SQL được authorize/apply

**File:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/models.py

Source hiện tại có Base và CollectionModel. Giữ nguyên CollectionModel.

**MODIFY – INSERT:** thêm import:

~~~python
from sqlalchemy import BigInteger, CHAR, DateTime, ForeignKey, String, Text, text
~~~

Thay import SQLAlchemy hiện tại bằng import trên và giữ PG_UUID, DeclarativeBase, Mapped, mapped_column.

**MODIFY – INSERT:** chèn class dưới đây sau CollectionModel:

~~~python
class DocumentModel(Base):
    __tablename__ = "documents"
    __table_args__: ClassVar[dict[str, Any]] = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    collection_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("public.collections.id", ondelete="RESTRICT"),
        nullable=False,
    )
    upload_session_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        unique=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_extension: Mapped[str] = mapped_column(String(10), nullable=False)
    content_type: Mapped[str] = mapped_column(String(127), nullable=False)
    declared_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source_sha256: Mapped[str | None] = mapped_column(CHAR(64), nullable=True)
    registration_status: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default=text("'AWAITING_UPLOAD'")
    )
    cleanup_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'NOT_REQUESTED'")
    )
    registration_attempt_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    registration_lease_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    registered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
~~~

Không thêm relationship cascade. Không gọi Base.metadata.create_all(). Task này BLOCKED cho tới khi schema đã được owner authorize/apply.

## B-03. Thêm Pydantic schemas và sửa DocumentCount

**File:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py

Thêm import:

~~~python
from pathlib import Path
~~~

**MODIFY – REPLACE METHOD:** đổi CollectionResponse.from_model thành:

~~~python
@classmethod
def from_model(
    cls,
    m: Any,
    document_count: int = 0,
) -> "CollectionResponse":
    return cls(
        Id=str(m.id),
        Name=m.name,
        Description=m.description,
        CreatedAt=m.created_at.isoformat()
        if hasattr(m.created_at, "isoformat")
        else str(m.created_at),
        UpdatedAt=m.updated_at.isoformat()
        if hasattr(m.updated_at, "isoformat")
        else str(m.updated_at),
        DocumentCount=document_count,
    )
~~~

**MODIFY – INSERT:** chèn cuối file các schema sau:

~~~python
MAX_DOCUMENT_BYTES = 52_428_800
DOCUMENT_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".txt": "text/plain",
}
DOCUMENT_REGISTRATION_STATUSES = {
    "AWAITING_UPLOAD",
    "REGISTERING",
    "REGISTRATION_FAILED",
    "REGISTERED",
}


class DocumentUploadIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    UploadSessionId: UUID
    OriginalFileName: str
    DeclaredSizeBytes: int = Field(gt=0, le=MAX_DOCUMENT_BYTES)

    @field_validator("UploadSessionId")
    @classmethod
    def validate_session_id(cls, value: UUID) -> UUID:
        return validate_nonzero_uuid(value)

    @field_validator("OriginalFileName")
    @classmethod
    def validate_original_filename(cls, value: str) -> str:
        name = value.strip()
        if not name or len(name) > 255:
            raise ValueError("Tên tệp phải có từ 1 đến 255 ký tự")

        if (
            "/" in name
            or chr(92) in name
            or ":" in name
            or ".." in name
            or any(ord(ch) < 32 or ord(ch) == 127 for ch in name)
        ):
            raise ValueError("Tên tệp không được chứa đường dẫn hoặc ký tự điều khiển")

        extension = Path(name).suffix.lower()
        if extension not in DOCUMENT_MIME_TYPES:
            raise ValueError("Chỉ chấp nhận PDF, Markdown và TXT")

        if Path(name).name != name:
            raise ValueError("Tên tệp phải là basename")

        return name


class DocumentUploadIntentResponse(BaseModel):
    DocumentId: str
    UploadSessionId: str
    RegistrationStatus: str


class DocumentResponse(BaseModel):
    Id: str
    CollectionId: str
    Title: str
    OriginalFileName: str
    FileExtension: str
    ContentType: str
    SizeBytes: int
    RegistrationStatus: str
    CreatedAt: str
    UpdatedAt: str
    RegisteredAt: str | None = None

    @classmethod
    def from_model(cls, document: Any) -> "DocumentResponse":
        size = document.size_bytes or document.declared_size_bytes
        return cls(
            Id=str(document.id),
            CollectionId=str(document.collection_id),
            Title=document.title,
            OriginalFileName=document.original_filename,
            FileExtension=document.file_extension,
            ContentType=document.content_type,
            SizeBytes=int(size),
            RegistrationStatus=document.registration_status,
            CreatedAt=document.created_at.isoformat(),
            UpdatedAt=document.updated_at.isoformat(),
            RegisteredAt=(
                document.registered_at.isoformat()
                if document.registered_at is not None
                else None
            ),
        )


class DocumentPageResponse(BaseModel):
    Data: list[DocumentResponse]
    TotalRow: int
    PageIndex: int
    PageSize: int


class DocumentDeleteResponse(BaseModel):
    Id: str
    CleanupStatus: str
~~~

Không thêm file_id/storage_key/source_sha256 vào DocumentResponse. MIME được xác định phía server theo extension; không tin browser Content-Type.

**Tests:** tạo tests/test_schemas.py nếu chưa có, hoặc mở rộng file hiện tại. Test PDF/MD/TXT hợp lệ; UUID zero; filename chứa slash, backslash, colon, NUL/control, traversal; extension không hỗ trợ; size 0 và >50 MiB; extra fields bị từ chối; public DTO không có storage_key/file_id/hash.

## B-04. Generate Python FileProto stubs

**Generated files:**
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2_grpc.py

Chạy từ repository root, dùng grpcio-tools đã có trong dev dependency:

~~~powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService --group dev python -m grpc_tools.protoc -I src/services/Blocks.FileService/Protos --python_out=src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc --grpc_python_out=src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc src/services/Blocks.FileService/Protos/file.proto
~~~

Mở file_pb2_grpc.py. Nếu import đang là import tuyệt đối sai package, sửa duy nhất import thành pattern giống system_pb2_grpc.py:

~~~python
from knowledgehub.rpc import file_pb2 as knowledgehub_dot_rpc_dot_file__pb2
~~~

Không sửa descriptor/generated message bằng tay.

**File:** tests/test_proto_stubs.py

Thêm test:
- import file_pb2 và file_pb2_grpc.
- UploadDataRequest field numbers 1-4 giữ nguyên.
- ModelAttachmentProto fields 1-8 giữ nguyên.
- source_sha256 là field 9.
- DeleteData/PreviewFile RPC vẫn tồn tại.

## B-05. Thêm FileService settings

**File:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py

Thêm fields vào Settings:

~~~python
file_grpc_url: str
file_grpc_ca_file: Path
file_rpc_timeout_seconds: float = Field(default=10.0)
file_download_timeout_seconds: float = Field(default=60.0)
~~~

Thêm validators:

~~~python
@field_validator("file_grpc_url")
@classmethod
def validate_file_grpc_url(cls, value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https":
        raise ValueError("Scheme must be https")
    if not parsed.hostname:
        raise ValueError("URL must include host")
    try:
        port = parsed.port
    except ValueError:
        raise ValueError("Invalid port")
    if port is None or not (1 <= port <= 65535):
        raise ValueError("URL must include a valid port (1-65535)")
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("URL must not contain credentials, query, or fragment")
    if parsed.path and parsed.path != "/":
        raise ValueError("URL must not contain non-root path")
    return value


@field_validator("file_grpc_ca_file")
@classmethod
def validate_file_ca_file(cls, value: Path) -> Path:
    if not value.is_absolute() or not value.is_file() or not os.access(value, os.R_OK):
        raise ValueError("FileService CA path must be an absolute readable file")

    try:
        content = value.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise ValueError("FileService CA must be a UTF-8 PEM certificate")

    if (
        "-----BEGIN CERTIFICATE-----" not in content
        or "-----END CERTIFICATE-----" not in content
        or "PRIVATE KEY" in content
    ):
        raise ValueError("FileService CA must contain certificates and no private key")

    try:
        ssl._ssl._test_decode_cert(str(value))
    except Exception:
        raise ValueError("FileService CA must be a valid X.509 PEM certificate")

    return value


@field_validator("file_rpc_timeout_seconds", "file_download_timeout_seconds")
@classmethod
def validate_file_timeouts(cls, value: float) -> float:
    if not math.isfinite(value) or value <= 0 or value > 120:
        raise ValueError("FileService timeout must be finite and in (0, 120]")
    return value
~~~

Giữ nguyên validator system_grpc_url/system_grpc_ca_file hiện tại.

**Tests:** trong tests/test_config.py, thêm KNOWLEDGEHUB_FILE_GRPC_URL và KNOWLEDGEHUB_FILE_GRPC_CA_FILE vào valid_env; thêm cases HTTP, missing port, credentials, query, path, CA missing/relative/nonexistent/fake PEM/private key và timeout 0/negative/nan/inf/>120.

## B-06. Tạo FileServiceClient

**CREATE – FULL FILE:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/file_service.py

~~~python
import asyncio
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import grpc
from fastapi import HTTPException, Request

from knowledgehub.config import Settings
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.rpc import file_pb2, file_pb2_grpc


@dataclass(frozen=True)
class FinalizedFile:
    file_id: UUID
    document_id: UUID
    storage_key: str
    original_filename: str
    file_extension: str
    size_bytes: int
    source_sha256: str


@dataclass(frozen=True)
class FilePreview:
    content: bytes
    file_name: str
    content_type: str


class FileServiceClient:
    def __init__(
        self,
        settings: Settings,
        channel: grpc.aio.Channel | None = None,
        stub: file_pb2_grpc.FileProtoStub | None = None,
    ):
        self.settings = settings
        self._owns_channel = False
        self._download_semaphore = asyncio.Semaphore(1)

        if stub is not None:
            self.channel = channel
            self.stub = stub
        else:
            parsed = urlparse(settings.file_grpc_url)
            target = f"{parsed.hostname}:{parsed.port}"
            root_certs = settings.file_grpc_ca_file.read_bytes()
            credentials = grpc.ssl_channel_credentials(
                root_certificates=root_certs
            )
            self.channel = grpc.aio.secure_channel(
                target,
                credentials,
                options=(
                    ("grpc.max_receive_message_length", 64 * 1024 * 1024),
                ),
            )
            self.stub = file_pb2_grpc.FileProtoStub(self.channel)
            self._owns_channel = True

    @staticmethod
    def _metadata(user: AuthenticatedUser):
        return (("x-service-authorization", "Bearer " + user.token),)

    @staticmethod
    def _map_rpc_error(error: grpc.RpcError) -> HTTPException:
        code = error.code()
        mapping = {
            grpc.StatusCode.UNAUTHENTICATED: (401, "Xác thực không thành công"),
            grpc.StatusCode.PERMISSION_DENIED: (403, "Bạn không có quyền truy cập"),
            grpc.StatusCode.NOT_FOUND: (404, "Không tìm thấy tài nguyên"),
            grpc.StatusCode.INVALID_ARGUMENT: (400, "Yêu cầu tệp không hợp lệ"),
            grpc.StatusCode.FAILED_PRECONDITION: (409, "Trạng thái tệp không hợp lệ"),
            grpc.StatusCode.RESOURCE_EXHAUSTED: (413, "Tệp vượt quá giới hạn dung lượng"),
            grpc.StatusCode.UNAVAILABLE: (503, "FileService tạm thời không khả dụng"),
            grpc.StatusCode.DEADLINE_EXCEEDED: (503, "FileService xử lý quá thời gian"),
            grpc.StatusCode.INTERNAL: (503, "FileService gặp lỗi nội bộ"),
        }
        status, message = mapping.get(
            code,
            (503, "FileService tạm thời không khả dụng"),
        )
        return HTTPException(status_code=status, detail=message)

    @staticmethod
    def _validate_storage_key(
        key: str,
        document_id: UUID,
        file_id: UUID,
        extension: str,
    ) -> None:
        parts = key.split("/")
        expected_name = str(file_id) + extension

        if (
            len(parts) != 4
            or parts[0] != "KnowledgeHub"
            or parts[1] != "Documents"
            or parts[2] != str(document_id)
            or parts[3] != expected_name
            or extension not in (".pdf", ".md", ".txt")
        ):
            raise HTTPException(
                status_code=503,
                detail="FileService trả về storage key không hợp lệ",
            )

    async def finalize_upload(
        self,
        user: AuthenticatedUser,
        document_id: UUID,
        upload_session_id: UUID,
        original_filename: str,
        file_extension: str,
        declared_size_bytes: int,
    ) -> FinalizedFile:
        request = file_pb2.UploadDataRequest(
            related_id=str(document_id),
            service_path="KnowledgeHub",
            folder_name="Documents",
            temp_folder=str(upload_session_id),
        )

        try:
            response = await self.stub.UploadData(
                request,
                metadata=self._metadata(user),
                timeout=self.settings.file_rpc_timeout_seconds,
            )
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as error:
            raise self._map_rpc_error(error) from None

        if len(response.attachments) != 1:
            raise HTTPException(
                status_code=503,
                detail="FileService trả về số lượng tệp không hợp lệ",
            )

        item = response.attachments[0]
        try:
            file_id = UUID(item.id)
            returned_document_id = UUID(item.related_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=503,
                detail="FileService trả về định danh không hợp lệ",
            ) from None

        if (
            file_id.int == 0
            or returned_document_id != document_id
            or item.file_extension != file_extension
            or item.file_name != Path(original_filename).stem
            or not item.HasField("file_size")
        ):
            raise HTTPException(
                status_code=503,
                detail="Metadata FileService không khớp upload intent",
            )

        size_value = item.file_size.value
        if (
            not size_value.is_integer()
            or int(size_value) != declared_size_bytes
            or int(size_value) <= 0
            or int(size_value) > 52_428_800
        ):
            raise HTTPException(
                status_code=503,
                detail="Kích thước FileService không khớp upload intent",
            )

        if not re.fullmatch(r"[0-9a-fA-F]{64}", item.source_sha256):
            raise HTTPException(
                status_code=503,
                detail="SHA256 FileService không hợp lệ",
            )

        self._validate_storage_key(
            item.file_url,
            document_id,
            file_id,
            file_extension,
        )

        return FinalizedFile(
            file_id=file_id,
            document_id=document_id,
            storage_key=item.file_url,
            original_filename=original_filename,
            file_extension=file_extension,
            size_bytes=int(size_value),
            source_sha256=item.source_sha256.lower(),
        )

    async def preview_file(
        self,
        user: AuthenticatedUser,
        storage_key: str,
    ) -> FilePreview:
        request = file_pb2.PreviewFileRequest(file_url=storage_key)

        async with self._download_semaphore:
            try:
                response = await self.stub.PreviewFile(
                    request,
                    metadata=self._metadata(user),
                    timeout=self.settings.file_download_timeout_seconds,
                )
            except asyncio.CancelledError:
                raise
            except grpc.RpcError as error:
                raise self._map_rpc_error(error) from None

        if len(response.file_content) > 52_428_800:
            raise HTTPException(
                status_code=413,
                detail="Tệp vượt quá giới hạn dung lượng",
            )

        return FilePreview(
            content=bytes(response.file_content),
            file_name=response.file_name,
            content_type=response.content_type or "application/octet-stream",
        )

    async def delete_file(
        self,
        user: AuthenticatedUser,
        storage_key: str,
    ) -> bool:
        request = file_pb2.DeleteDataRequest(file_paths=[storage_key])
        try:
            response = await self.stub.DeleteData(
                request,
                metadata=self._metadata(user),
                timeout=self.settings.file_rpc_timeout_seconds,
            )
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as error:
            raise self._map_rpc_error(error) from None

        return bool(response.success)

    async def check_channel_health(self) -> bool:
        if self.channel is None:
            return True
        try:
            await asyncio.wait_for(
                self.channel.channel_ready(),
                timeout=min(self.settings.file_rpc_timeout_seconds, 2.0),
            )
            return True
        except Exception:
            return False

    async def close(self) -> None:
        if self._owns_channel and self.channel is not None:
            await self.channel.close()


def get_file_service_client(request: Request) -> FileServiceClient:
    client = getattr(request.app.state, "file_service_client", None)
    if client is None:
        raise RuntimeError("FileServiceClient is not initialized in application state")
    return client
~~~

Mọi RPC đều dùng metadata riêng của request hiện tại. Không set JWT ở channel-global metadata. PreviewFile dùng semaphore 1 và receive limit tối thiểu 64 MiB.

## B-07. Đăng ký FileServiceClient trong lifespan và AppHost

**File:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py

Source lifespan hiện tại khởi tạo PermissionClient và DB engine. Thêm import:

~~~python
from knowledgehub.file_service import FileServiceClient, get_file_service_client
from knowledgehub.document_routes import document_router
~~~

**MODIFY – REPLACE lifespan:** thay function lifespan hiện tại bằng:

~~~python
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    permission_client = PermissionClient(settings)
    file_service_client = FileServiceClient(settings)
    engine = create_db_engine(settings.database_url.get_secret_value())

    app.state.permission_client = permission_client
    app.state.file_service_client = file_service_client
    app.state.db_engine = engine
    app.state.db_session_factory = create_session_factory(engine)

    try:
        yield
    finally:
        try:
            await file_service_client.close()
        finally:
            try:
                await permission_client.close()
            finally:
                await engine.dispose()
                app.state.permission_client = None
                app.state.file_service_client = None
                app.state.db_engine = None
                app.state.db_session_factory = None
~~~

**MODIFY – UPDATE health:** thêm dependency FileServiceClient và check:

~~~python
@app.get("/health")
async def health(
    request: Request,
    permission_client: PermissionClient = Depends(get_permission_client),
    file_service_client: FileServiceClient = Depends(get_file_service_client),
):
    if not await permission_client.check_channel_health():
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    if not await file_service_client.check_channel_health():
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    engine = getattr(request.app.state, "db_engine", None)
    if not await check_db_health(engine, timeout=2.0):
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    return {"status": "healthy"}
~~~

Giữ /alive độc lập. Cuối file, sau app.include_router(api_router), thêm:

~~~python
app.include_router(document_router)
~~~

**File:** src/platform/Blocks.AppHost/AppHost.cs

Trong knowledgeHub builder chain, thêm:

~~~csharp
.WithReference(fileService)
.WithEnvironment(
    "KNOWLEDGEHUB_FILE_GRPC_URL",
    fileService.GetEndpoint("https"))
.WithEnvironment(
    "KNOWLEDGEHUB_FILE_GRPC_CA_FILE",
    knowledgeHubGrpcCaFile)
~~~

Trong AppHost hiện tại đã có biến knowledgeHubGrpcCaFile cho SystemService. Code trên tái sử dụng biến này; chỉ giữ cách này nếu CA đó xác thực được certificate của FileService. Nếu certificate chain khác, tạo parameter riêng và truyền parameter đó. Owner phải kiểm tra CA thực tế; không tắt certificate validation.

Không thêm FileService vào Gateway route. Chỉ AppHost service-to-service reference.

## B-08. Tạo documents.py – SQL builders và lifecycle repository

**CREATE – FULL FILE:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/documents.py

~~~python
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.models import CollectionModel, DocumentModel
from knowledgehub.schemas import (
    DOCUMENT_MIME_TYPES,
    DocumentUploadIntentRequest,
)

REGISTRATION_LEASE_SECONDS = 90


def _document_query():
    return (
        select(DocumentModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
    )


def build_get_active_document_query(
    document_id: UUID,
    actor_id: UUID,
):
    return _document_query().where(
        DocumentModel.id == document_id,
        DocumentModel.deleted_at.is_(None),
        CollectionModel.owner_id == actor_id,
        CollectionModel.deleted_at.is_(None),
    )


def build_list_documents_query(
    actor_id: UUID,
    collection_id: UUID,
    page_index: int,
    page_size: int,
    query_text: str | None = None,
    registration_status: str | None = None,
):
    stmt = _document_query().where(
        DocumentModel.collection_id == collection_id,
        DocumentModel.deleted_at.is_(None),
        CollectionModel.id == collection_id,
        CollectionModel.owner_id == actor_id,
        CollectionModel.deleted_at.is_(None),
    )

    if query_text:
        escaped = (
            query_text.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        stmt = stmt.where(
            or_(
                DocumentModel.title.ilike(pattern, escape="\\"),
                DocumentModel.original_filename.ilike(pattern, escape="\\"),
            )
        )

    if registration_status:
        stmt = stmt.where(
            DocumentModel.registration_status == registration_status
        )

    return (
        stmt.order_by(
            DocumentModel.created_at.desc(),
            DocumentModel.id.desc(),
        )
        .offset((page_index - 1) * page_size)
        .limit(page_size)
    )


def build_count_documents_query(
    actor_id: UUID,
    collection_id: UUID,
    query_text: str | None = None,
    registration_status: str | None = None,
):
    stmt = (
        select(func.count())
        .select_from(DocumentModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.collection_id == collection_id,
            DocumentModel.deleted_at.is_(None),
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
        )
    )

    if query_text:
        escaped = (
            query_text.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        stmt = stmt.where(
            or_(
                DocumentModel.title.ilike(pattern, escape="\\"),
                DocumentModel.original_filename.ilike(pattern, escape="\\"),
            )
        )

    if registration_status:
        stmt = stmt.where(
            DocumentModel.registration_status == registration_status
        )

    return stmt


async def create_upload_intent(
    session: AsyncSession,
    actor_id: UUID,
    collection_id: UUID,
    data: DocumentUploadIntentRequest,
) -> DocumentModel | None:
    collection = await session.scalar(
        select(CollectionModel)
        .where(
            CollectionModel.id == collection_id,
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
        )
        .with_for_update()
    )

    if collection is None:
        return None

    extension = Path(data.OriginalFileName).suffix.lower()
    content_type = DOCUMENT_MIME_TYPES[extension]
    title = Path(data.OriginalFileName).stem
    document_id = uuid4()

    insert_stmt = (
        pg_insert(DocumentModel)
        .values(
            id=document_id,
            collection_id=collection_id,
            upload_session_id=data.UploadSessionId,
            title=title,
            original_filename=data.OriginalFileName,
            file_extension=extension,
            content_type=content_type,
            declared_size_bytes=data.DeclaredSizeBytes,
            registration_status="AWAITING_UPLOAD",
            cleanup_status="NOT_REQUESTED",
        )
        .on_conflict_do_nothing(
            index_elements=[DocumentModel.upload_session_id]
        )
        .returning(DocumentModel.id)
    )

    inserted_id = await session.scalar(insert_stmt)
    if inserted_id is not None:
        await session.flush()
        return await session.scalar(
            select(DocumentModel).where(DocumentModel.id == inserted_id)
        )

    existing = await session.scalar(
        _document_query().where(
            DocumentModel.upload_session_id == data.UploadSessionId,
            CollectionModel.owner_id == actor_id,
        )
    )

    if (
        existing is None
        or existing.collection_id != collection_id
        or existing.original_filename != data.OriginalFileName
        or existing.declared_size_bytes != data.DeclaredSizeBytes
    ):
        raise HTTPException(
            status_code=409,
            detail="UploadSessionId đã được sử dụng cho upload intent khác",
        )

    return existing


async def get_document_and_parent(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
):
    result = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
    )
    return result.one_or_none()


async def get_active_document(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
) -> DocumentModel | None:
    return await session.scalar(
        build_get_active_document_query(document_id, actor_id)
    )


async def claim_registration(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
):
    # Lock document and parent. Collection soft-delete updates the parent row.
    result = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
        .with_for_update()
    )
    pair = result.one_or_none()
    if pair is None:
        return None

    document, collection = pair
    if collection.deleted_at is not None:
        document.registration_status = "BLOCKED_PARENT_DELETED"
        document.registration_attempt_id = None
        document.registration_lease_until = None
        await session.flush()
        return None

    if document.registration_status == "REGISTERED":
        return document, None

    now = datetime.now(timezone.utc)
    if (
        document.registration_status == "REGISTERING"
        and document.registration_lease_until is not None
        and document.registration_lease_until > now
    ):
        raise HTTPException(
            status_code=409,
            detail="Tài liệu đang được đăng ký",
        )

    attempt_id = uuid4()
    document.registration_status = "REGISTERING"
    document.registration_attempt_id = attempt_id
    document.registration_lease_until = now + timedelta(
        seconds=REGISTRATION_LEASE_SECONDS
    )
    document.last_error_code = None
    document.last_error_at = None
    await session.flush()

    return document, attempt_id


async def mark_registration_failed(
    session: AsyncSession,
    document_id: UUID,
    attempt_id: UUID,
    error_code: str,
) -> bool:
    result = await session.execute(
        update(DocumentModel)
        .where(
            DocumentModel.id == document_id,
            DocumentModel.registration_attempt_id == attempt_id,
            DocumentModel.registration_status == "REGISTERING",
        )
        .values(
            registration_status="REGISTRATION_FAILED",
            registration_attempt_id=None,
            registration_lease_until=None,
            last_error_code=error_code[:64],
            last_error_at=func.now(),
        )
        .returning(DocumentModel.id)
    )
    return result.scalar_one_or_none() is not None


async def commit_finalized_reference(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
    attempt_id: UUID,
    finalized,
) -> DocumentModel | None:
    pair = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
        .with_for_update()
    )
    row = pair.one_or_none()
    if row is None:
        return None

    document, collection = row
    if document.registration_attempt_id != attempt_id:
        return None

    document.file_id = finalized.file_id
    document.storage_key = finalized.storage_key
    document.size_bytes = finalized.size_bytes
    document.source_sha256 = finalized.source_sha256.lower()
    document.content_type = DOCUMENT_MIME_TYPES[document.file_extension]
    document.registration_attempt_id = None
    document.registration_lease_until = None

    if collection.deleted_at is None:
        document.registration_status = "REGISTERED"
        document.registered_at = datetime.now(timezone.utc)
        document.last_error_code = None
        document.last_error_at = None
    else:
        document.registration_status = "PARENT_DELETED_RETAINED"
        document.registered_at = None

    await session.flush()
    return document


async def list_documents(
    session: AsyncSession,
    actor_id: UUID,
    collection_id: UUID,
    page_index: int,
    page_size: int,
    query_text: str | None,
    registration_status: str | None,
):
    count_result = await session.execute(
        build_count_documents_query(
            actor_id,
            collection_id,
            query_text,
            registration_status,
        )
    )
    total = int(count_result.scalar() or 0)

    result = await session.execute(
        build_list_documents_query(
            actor_id,
            collection_id,
            page_index,
            page_size,
            query_text,
            registration_status,
        )
    )
    return list(result.scalars().all()), total


async def soft_delete_document(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
) -> DocumentModel | None:
    # Lock parent and document so collection deletion and document deletion serialize.
    result = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
            DocumentModel.deleted_at.is_(None),
            DocumentModel.registration_status == "REGISTERED",
        )
        .with_for_update()
    )
    pair = result.one_or_none()
    if pair is None:
        return None

    document, collection = pair
    document.deleted_at = datetime.now(timezone.utc)
    document.cleanup_status = "PENDING"
    await session.flush()
    return document


async def update_cleanup_status(
    session: AsyncSession,
    document_id: UUID,
    cleanup_status: str,
) -> bool:
    result = await session.execute(
        update(DocumentModel)
        .where(
            DocumentModel.id == document_id,
            DocumentModel.deleted_at.is_not(None),
        )
        .values(cleanup_status=cleanup_status)
        .returning(DocumentModel.id)
    )
    return result.scalar_one_or_none() is not None


async def get_active_document_counts(
    session: AsyncSession,
    actor_id: UUID,
    collection_ids: list[UUID],
) -> dict[UUID, int]:
    if not collection_ids:
        return {}

    result = await session.execute(
        select(
            DocumentModel.collection_id,
            func.count(DocumentModel.id),
        )
        .join(
            CollectionModel,
            CollectionModel.id == DocumentModel.collection_id,
        )
        .where(
            DocumentModel.collection_id.in_(collection_ids),
            DocumentModel.deleted_at.is_(None),
            DocumentModel.registration_status == "REGISTERED",
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
        )
        .group_by(DocumentModel.collection_id)
    )
    return {collection_id: int(count) for collection_id, count in result.all()}
~~~

Các transaction boundary do route quản lý:
- upload intent: commit sau create_upload_intent.
- claim registration: commit trước FileService RPC.
- commit finalized reference: transaction mới, lock/recheck collection.
- logical delete: commit trước FileService DeleteData.
- cleanup status: commit sau RPC.

## B-09. Tạo document_routes.py

**CREATE – FULL FILE:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/document_routes.py

~~~python
from pathlib import Path
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.database import get_db_session
from knowledgehub.documents import (
    claim_registration,
    commit_finalized_reference,
    create_upload_intent,
    get_active_document,
    get_document_and_parent,
    list_documents,
    mark_registration_failed,
    soft_delete_document,
    update_cleanup_status,
)
from knowledgehub.file_service import (
    FileServiceClient,
    get_file_service_client,
)
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.permission import require_permission
from knowledgehub.responses import error_response, success_response
from knowledgehub.schemas import (
    DocumentDeleteResponse,
    DocumentPageResponse,
    DocumentResponse,
    DocumentUploadIntentRequest,
    DocumentUploadIntentResponse,
    validate_nonzero_uuid,
)

document_router = APIRouter(prefix="/api/knowledgehub")


@document_router.post("/collections/{collection_id}/documents/upload-intents")
async def create_document_upload_intent_endpoint(
    collection_id: str,
    data: DocumentUploadIntentRequest,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 2)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_collection_id = validate_nonzero_uuid(collection_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await create_upload_intent(
        session,
        user.actor_id,
        parsed_collection_id,
        data,
    )

    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    await session.commit()

    response = DocumentUploadIntentResponse(
        DocumentId=str(document.id),
        UploadSessionId=str(document.upload_session_id),
        RegistrationStatus=document.registration_status,
    )
    return success_response(data=response.model_dump())


@document_router.post("/documents/{document_id}/finalize")
async def finalize_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 2)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    pair = await get_document_and_parent(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if pair is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    document, collection = pair

    if collection.deleted_at is not None:
        document.registration_status = "BLOCKED_PARENT_DELETED"
        await session.commit()
        return error_response(404, "Không tìm thấy tài nguyên")

    if document.registration_status == "REGISTERED":
        return success_response(
            data=DocumentResponse.from_model(document).model_dump()
        )

    claimed = await claim_registration(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if claimed is None:
        await session.commit()
        return error_response(404, "Không tìm thấy tài nguyên")

    document, attempt_id = claimed
    if attempt_id is None:
        return success_response(
            data=DocumentResponse.from_model(document).model_dump()
        )

    # Important: commit the lease before calling FileService.
    await session.commit()

    try:
        finalized = await file_service.finalize_upload(
            user,
            document.id,
            document.upload_session_id,
            document.original_filename,
            document.file_extension,
            document.declared_size_bytes,
        )
    except HTTPException as exc:
        await mark_registration_failed(
            session,
            document.id,
            attempt_id,
            f"FILESERVICE_{exc.status_code}",
        )
        await session.commit()
        raise
    except Exception:
        await mark_registration_failed(
            session,
            document.id,
            attempt_id,
            "FILESERVICE_UNEXPECTED",
        )
        await session.commit()
        raise HTTPException(
            status_code=503,
            detail="Không thể hoàn tất đăng ký tài liệu",
        ) from None

    # New transaction: lock and recheck the parent collection after RPC.
    registered = await commit_finalized_reference(
        session,
        document.id,
        user.actor_id,
        attempt_id,
        finalized,
    )

    if registered is None:
        await session.rollback()
        return error_response(409, "Yêu cầu đăng ký đã hết hiệu lực")

    await session.commit()

    if registered.registration_status == "PARENT_DELETED_RETAINED":
        return error_response(404, "Không tìm thấy tài nguyên")

    return success_response(
        data=DocumentResponse.from_model(registered).model_dump()
    )


@document_router.get("/collections/{collection_id}/documents")
async def list_documents_endpoint(
    collection_id: str,
    q: str | None = Query(default=None, max_length=255),
    registration_status: str | None = Query(default=None),
    page_index: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_collection_id = validate_nonzero_uuid(collection_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    allowed_statuses = {
        "AWAITING_UPLOAD",
        "REGISTERING",
        "REGISTRATION_FAILED",
        "REGISTERED",
    }
    if registration_status is not None and registration_status not in allowed_statuses:
        return error_response(400, "RegistrationStatus không hợp lệ")

    # Validate active collection ownership even when the result page is empty.
    from knowledgehub.collections import get_collection

    collection = await get_collection(
        session,
        parsed_collection_id,
        user.actor_id,
    )
    if collection is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    items, total = await list_documents(
        session,
        user.actor_id,
        parsed_collection_id,
        page_index,
        page_size,
        q,
        registration_status,
    )

    response = DocumentPageResponse(
        Data=[DocumentResponse.from_model(item) for item in items],
        TotalRow=total,
        PageIndex=page_index,
        PageSize=page_size,
    )
    return success_response(data=response.model_dump())


@document_router.get("/documents/{document_id}")
async def get_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await get_active_document(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    return success_response(
        data=DocumentResponse.from_model(document).model_dump()
    )


@document_router.get("/documents/{document_id}/download")
async def download_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await get_active_document(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if (
        document is None
        or document.registration_status != "REGISTERED"
        or not document.storage_key
    ):
        return error_response(404, "Không tìm thấy tài nguyên")

    preview = await file_service.preview_file(
        user,
        document.storage_key,
    )

    safe_filename = quote(document.original_filename)
    return Response(
        content=preview.content,
        media_type=document.content_type,
        headers={
            "Content-Disposition": (
                "attachment; filename*=UTF-8''" + safe_filename
            ),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@document_router.delete("/documents/{document_id}")
async def delete_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 4)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await soft_delete_document(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    # Logical deletion must commit before FileService DeleteData.
    await session.commit()

    cleanup_status = "FAILED"
    try:
        deleted = await file_service.delete_file(
            user,
            document.storage_key,
        )
        cleanup_status = "COMPLETED" if deleted else "FAILED"
    except Exception:
        cleanup_status = "FAILED"

    await update_cleanup_status(
        session,
        document.id,
        cleanup_status,
    )
    await session.commit()

    response = DocumentDeleteResponse(
        Id=str(document.id),
        CleanupStatus=cleanup_status,
    )
    return success_response(data=response.model_dump())
~~~

Đây là baseline implementation để bạn chép và chạy test. Khi code thực tế, hãy sửa import/local typing theo source hiện tại; không đổi transaction ordering hoặc owner predicates.

## B-10. Sửa DocumentCount và đăng ký document router

**File:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py

Import thêm:

~~~python
from knowledgehub.documents import get_active_document_counts
~~~

Trong list_collections_endpoint, thay:

~~~python
data = [CollectionResponse.from_model(item) for item in items]
~~~

bằng:

~~~python
counts = await get_active_document_counts(
    session,
    user.actor_id,
    [item.id for item in items],
)
data = [
    CollectionResponse.from_model(
        item,
        document_count=counts.get(item.id, 0),
    )
    for item in items
]
~~~

Trong get_collection_endpoint, sau khi tìm thấy item, thêm:

~~~python
counts = await get_active_document_counts(
    session,
    user.actor_id,
    [item.id],
)
return success_response(
    data=CollectionResponse.from_model(
        item,
        document_count=counts.get(item.id, 0),
    ).model_dump()
)
~~~

Giữ nguyên route create/update; DocumentCount mặc định 0 khi chưa có tài liệu.

Cuối file giữ:

~~~python
app.include_router(api_router)
app.include_router(document_router)
~~~

Chỉ có một grouped count query cho collection list; không tạo N+1 query.

## B-11. Test Backend

Tạo các file test:

### tests/test_file_service.py
- secure channel tạo từ HTTPS host:port và CA.
- UploadData gửi đúng related_id, service_path=KnowledgeHub, folder_name=Documents, temp_folder=UploadSessionId.
- metadata x-service-authorization là token của đúng user.
- timeout được truyền vào mỗi RPC.
- PreviewFile semaphore chỉ cho một request cùng lúc.
- field source_sha256 phải là 64 hex; size phải là integral byte count và bằng declared size.
- storage key không đúng namespace/document/file id phải fail.
- mapping gRPC statuses 401/403/404/400/409/413/503.
- cancellation được propagate.

### tests/test_documents.py
- mọi query document đều join active CollectionModel và filter owner_id.
- collection.deleted_at IS NULL luôn có trong list/detail/download/delete.
- deleted document không được list/detail/download.
- search escape %, _, backslash.
- ordering created_at DESC, id DESC.
- DocumentCount chỉ đếm REGISTERED và deleted_at IS NULL.
- upload_session_id lặp cùng metadata trả cùng document; khác metadata trả 409.
- registration_attempt_id cũ không ghi đè attempt mới.
- soft delete set deleted_at/PENDING nhưng giữ storage_key/file_id/hash.

### tests/test_document_endpoints.py
- ADD/VIEW/DELETE permission code chính xác.
- Actor B không thể truy cập Document của Actor A.
- unauthorized/foreign request không gọi FileService.
- finalize commit claim trước gRPC và commit result sau gRPC.
- timeout FileService không tạo success giả.
- download trả bytes và Content-Disposition/Cache-Control/nosniff.
- delete commit logical deletion trước DeleteData; cleanup fail vẫn document inaccessible.
- collection delete/finalize race có hai outcome đã định nghĩa.

### tests/test_database.py
- lifespan tạo PermissionClient, FileServiceClient và DB engine.
- shutdown đóng cả hai gRPC clients và engine ngay cả khi một close lỗi.
- /health phụ thuộc cả hai gRPC clients và DB.
- /alive không phụ thuộc các dependency.

Chạy:

~~~powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v
git diff --check
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj
& ./test/Backend.Upgrade.Check.ps1 -Check all
~~~

Không có test nào được kết nối database. SQL compilation và mock session không chứng minh PostgreSQL lock behavior; live check vẫn NOT RUN đến khi owner authorize.



---

# C. React Frontend – uploader, progress và document repository

## C-00. File Map

| Action | File | Required code |
| --- | --- | --- |
| Modify | src/apps/Blocks.Web/src/config/constants.ts | Thêm endpoint constants. |
| Modify | src/apps/Blocks.Web/src/lib/api.ts | Thêm postMultipart, xóa JSON Content-Type với FormData, download timeout. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts | Bỏ comment DocumentCount luôn bằng 0. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/types/documents.types.ts | Document DTO, query, upload queue types. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.ts | Typed API adapter. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/document-query-keys.ts | Actor/collection-scoped keys. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.ts | Query list/search/filter/page. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.ts | Download/delete/invalidation. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.ts | Sequential queue and actual byte progress. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.tsx | Accessible file picker/drop zone. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/UploadProgressList.tsx | Transfer and registration states. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.tsx | Search/filter/table/paging. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.tsx | Metadata and actions. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.tsx | Delete confirmation. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx | Replace P02 placeholder. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx | Pass actor/collection/permissions. |
| Modify | src/apps/Blocks.Web/src/Router.tsx | Mount KnowledgeHubCacheBoundary around KnowledgeHub route. |

## C-01. Endpoint constants

**File:** src/apps/Blocks.Web/src/config/constants.ts

Thay KnowledgeHub block hiện tại:

~~~ts
KnowledgeHub: {
  COLLECTIONS: KNOWLEDGEHUB_BASE + "/collections",
},
~~~

bằng:

~~~ts
KnowledgeHub: {
  COLLECTIONS: KNOWLEDGEHUB_BASE + "/collections",
  COLLECTION_DOCUMENTS: (id: string) =>
    KNOWLEDGEHUB_BASE + "/collections/" + encodeURIComponent(id) + "/documents",
  COLLECTION_UPLOAD_INTENTS: (id: string) =>
    KNOWLEDGEHUB_BASE + "/collections/" + encodeURIComponent(id) + "/documents/upload-intents",
  DOCUMENT: (id: string) =>
    KNOWLEDGEHUB_BASE + "/documents/" + encodeURIComponent(id),
  DOCUMENT_FINALIZE: (id: string) =>
    KNOWLEDGEHUB_BASE + "/documents/" + encodeURIComponent(id) + "/finalize",
  DOCUMENT_DOWNLOAD: (id: string) =>
    KNOWLEDGEHUB_BASE + "/documents/" + encodeURIComponent(id) + "/download",
},
~~~

Giữ API_ENDPOINTS.File.UploadFile.POST hiện tại.

## C-02. Multipart helper trong api.ts

**File:** src/apps/Blocks.Web/src/lib/api.ts

Thêm AxiosHeaders vào import:

~~~ts
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
~~~

Thay DownloadFileConfig:

~~~ts
export type DownloadFileConfig = Pick<
  AxiosRequestConfig,
  "signal" | "unwrapBlobErrors" | "timeout"
>;
~~~

Trong request interceptor, thay callback success bằng:

~~~ts
(config) => {
  config.headers = AxiosHeaders.from(config.headers);

  if (
    typeof FormData !== "undefined" &&
    config.data instanceof FormData
  ) {
    config.headers.delete("Content-Type");
  }

  const token = getAccessToken();
  if (token) config.headers.Authorization = "Bearer " + token;

  return config;
},
~~~

Trong ApiClient thêm method:

~~~ts
async postMultipart<T>(
  endpoint: string,
  data: FormData,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> {
  const response = await this.axiosInstance.post(endpoint, data, config);
  return response.data;
}
~~~

Thay downloadFile:

~~~ts
downloadFile(url: string, config?: DownloadFileConfig) {
  return this.axiosInstance.get(url, {
    responseType: "blob",
    signal: config?.signal,
    timeout: config?.timeout,
    unwrapBlobErrors: config?.unwrapBlobErrors,
  });
}
~~~

Không tạo Axios instance mới và không duplicate refresh-token interceptor.

## C-03. Document types

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/types/documents.types.ts

~~~ts
export type DocumentRegistrationStatus =
  | "AWAITING_UPLOAD"
  | "REGISTERING"
  | "REGISTRATION_FAILED"
  | "REGISTERED";

export interface DocumentDto {
  Id: string;
  CollectionId: string;
  Title: string;
  OriginalFileName: string;
  FileExtension: ".pdf" | ".md" | ".txt";
  ContentType: string;
  SizeBytes: number;
  RegistrationStatus: DocumentRegistrationStatus;
  CreatedAt: string;
  UpdatedAt: string;
  RegisteredAt: string | null;
}

export interface DocumentPageDto {
  Data: DocumentDto[];
  TotalRow: number;
  PageIndex: number;
  PageSize: number;
}

export interface DocumentListParams {
  q?: string;
  registration_status?: DocumentRegistrationStatus;
  page_index: number;
  page_size: number;
}

export interface DocumentUploadIntentRequest {
  UploadSessionId: string;
  OriginalFileName: string;
  DeclaredSizeBytes: number;
}

export interface DocumentUploadIntentDto {
  DocumentId: string;
  UploadSessionId: string;
  RegistrationStatus: string;
}

export interface DocumentDeleteDto {
  Id: string;
  CleanupStatus: "PENDING" | "COMPLETED" | "FAILED";
}

export type UploadQueueStatus =
  | "queued"
  | "creating-intent"
  | "uploading"
  | "registering"
  | "registered"
  | "failed";

export interface UploadQueueItem {
  key: string;
  file: File;
  uploadSessionId: string;
  documentId: string | null;
  status: UploadQueueStatus;
  loadedBytes: number;
  totalBytes: number;
  error: string | null;
}
~~~

Không thêm storage_key/file_id/SHA/JWT vào public type.

## C-04. documents.api.ts

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.ts

~~~ts
import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type {
  DocumentDeleteDto,
  DocumentDto,
  DocumentListParams,
  DocumentPageDto,
  DocumentUploadIntentDto,
  DocumentUploadIntentRequest,
} from "../types/documents.types";

export class DocumentApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "DocumentApiError";
  }
}

function unwrap<T>(result: ApiResponse<T>): T {
  if (!result.Success) {
    throw new DocumentApiError(
      result.StatusCode,
      result.Message || "Không thể thực hiện yêu cầu."
    );
  }
  if (result.Data == null) {
    throw new Error("Phản hồi KnowledgeHub không có dữ liệu.");
  }
  return result.Data;
}

function ensureSuccess(result: ApiResponse<unknown>): void {
  if (!result.Success) {
    throw new DocumentApiError(
      result.StatusCode,
      result.Message || "Không thể thực hiện yêu cầu."
    );
  }
}

export const documentsApi = {
  list: async (
    collectionId: string,
    params: DocumentListParams,
    signal?: AbortSignal
  ) =>
    unwrap<DocumentPageDto>(
      await api.get<DocumentPageDto>(
        API_ENDPOINTS.KnowledgeHub.COLLECTION_DOCUMENTS(collectionId),
        { params, signal }
      )
    ),

  createUploadIntent: async (
    collectionId: string,
    body: DocumentUploadIntentRequest
  ) =>
    unwrap<DocumentUploadIntentDto>(
      await api.post<DocumentUploadIntentDto>(
        API_ENDPOINTS.KnowledgeHub.COLLECTION_UPLOAD_INTENTS(collectionId),
        body
      )
    ),

  stage: async (
    uploadSessionId: string,
    file: File,
    onProgress: (loaded: number, total: number) => void,
    signal?: AbortSignal
  ) => {
    const form = new FormData();
    form.append("files", file);
    form.append("FolderName", uploadSessionId);

    const result = await api.postMultipart<unknown>(
      API_ENDPOINTS.File.UploadFile.POST,
      form,
      {
        signal,
        timeout: 120000,
        headers: {
          "X-Upload-Purpose": "KnowledgeHubDocument",
        },
        onUploadProgress: (event) =>
          onProgress(event.loaded, event.total ?? file.size),
      }
    );

    // FileService stage returns BaseResponse without Data on success.
    ensureSuccess(result);
  },

  finalize: async (documentId: string) =>
    unwrap<DocumentDto>(
      await api.post<DocumentDto>(
        API_ENDPOINTS.KnowledgeHub.DOCUMENT_FINALIZE(documentId)
      )
    ),

  download: async (
    documentId: string,
    signal?: AbortSignal
  ): Promise<Blob> => {
    const response = await api.downloadFile(
      API_ENDPOINTS.KnowledgeHub.DOCUMENT_DOWNLOAD(documentId),
      {
        signal,
        timeout: 120000,
        unwrapBlobErrors: true,
      }
    );
    return response.data as Blob;
  },

  remove: async (documentId: string) =>
    unwrap<DocumentDeleteDto>(
      await api.delete<DocumentDeleteDto>(
        API_ENDPOINTS.KnowledgeHub.DOCUMENT(documentId)
      )
    ),
};
~~~

Stage phải gửi:
- FormData field files: đúng một File.
- FormData field FolderName: UploadSessionId.
- HTTP header X-Upload-Purpose: KnowledgeHubDocument.
- Không tự set Content-Type multipart boundary.

## C-05. Query keys và useDocuments

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/document-query-keys.ts

~~~ts
import type { DocumentListParams } from "../types/documents.types";

export const documentKeys = {
  all: ["knowledgehub-documents"] as const,
  actor: (actorId: string) =>
    ["knowledgehub-documents", actorId] as const,
  collection: (actorId: string, collectionId: string) =>
    [...documentKeys.actor(actorId), collectionId] as const,
  list: (
    actorId: string,
    collectionId: string,
    params: DocumentListParams
  ) =>
    [...documentKeys.collection(actorId, collectionId), "list", params] as const,
};
~~~

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.ts

~~~ts
import { useQuery } from "@tanstack/react-query";
import { documentsApi } from "../api/documents.api";
import { documentKeys } from "./document-query-keys";
import type { DocumentListParams } from "../types/documents.types";

export function useDocuments(
  actorId: string | null,
  collectionId: string | null,
  canView: boolean,
  params: DocumentListParams
) {
  return useQuery({
    queryKey: documentKeys.list(
      actorId ?? "signed-out",
      collectionId ?? "no-collection",
      params
    ),
    enabled: Boolean(actorId && collectionId && canView),
    queryFn: ({ signal }) => {
      if (!collectionId) throw new Error("Chưa chọn bộ sưu tập");
      return documentsApi.list(collectionId, params, signal);
    },
    retry: false,
  });
}
~~~

## C-06. Upload queue – tuần tự, không fake progress

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.ts

~~~ts
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { documentsApi } from "../api/documents.api";
import { documentKeys } from "./document-query-keys";
import { collectionKeys } from "./collection-query-keys";
import { useKnowledgeHubSession } from "./KnowledgeHubCacheBoundary";
import type { UploadQueueItem } from "../types/documents.types";

const MAX_BYTES = 52_428_800;
const ACCEPTED = new Set([".pdf", ".md", ".txt"]);

function validateFile(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED.has(extension)) return "Chỉ chấp nhận PDF, Markdown và TXT.";
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return "Tệp phải lớn hơn 0 và không vượt quá 50 MiB.";
  }
  return null;
}

const storageKey = (actorId: string, documentId: string) =>
  "kh-upload:" + actorId + ":" + documentId;

export function useDocumentUploads(
  actorId: string | null,
  collectionId: string | null,
  canAdd: boolean
) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const currentSession = useKnowledgeHubSession();
  const queryClient = useQueryClient();

  const isCurrent = (guard: typeof currentSession.current) =>
    guard === currentSession.current;

  const updateItem = (key: string, patch: Partial<UploadQueueItem>) => {
    setItems((current) =>
      current.map((item) => item.key === key ? { ...item, ...patch } : item)
    );
  };

  const enqueueFiles = useCallback(async (files: File[]) => {
    const guard = currentSession.current;
    if (!actorId || !collectionId || !canAdd || guard.actorId !== actorId) {
      throw new Error("Bạn không có quyền tải tài liệu lên.");
    }
    if (runningRef.current) return;

    runningRef.current = true;
    setRunning(true);
    try {
      // FileService WriteGate is global: upload one file at a time.
      for (const file of files) {
        if (!isCurrent(guard)) return;

        const validationError = validateFile(file);
        const key = crypto.randomUUID();
        const uploadSessionId = crypto.randomUUID();

        setItems((current) => [...current, {
          key,
          file,
          uploadSessionId,
          documentId: null,
          status: validationError ? "failed" : "creating-intent",
          loadedBytes: 0,
          totalBytes: file.size,
          error: validationError,
        }]);

        if (validationError) continue;

        try {
          const intent = await documentsApi.createUploadIntent(collectionId, {
            UploadSessionId: uploadSessionId,
            OriginalFileName: file.name,
            DeclaredSizeBytes: file.size,
          });

          if (!isCurrent(guard)) return;

          updateItem(key, {
            documentId: intent.DocumentId,
            status: "uploading",
          });

          sessionStorage.setItem(
            storageKey(actorId, intent.DocumentId),
            uploadSessionId
          );

          await documentsApi.stage(
            uploadSessionId,
            file,
            (loaded, total) => {
              if (!isCurrent(guard)) return;
              updateItem(key, {
                status: "uploading",
                loadedBytes: loaded,
                totalBytes: total || file.size,
              });
            }
          );

          if (!isCurrent(guard)) return;

          updateItem(key, {
            status: "registering",
            loadedBytes: file.size,
            totalBytes: file.size,
          });

          await documentsApi.finalize(intent.DocumentId);
          if (!isCurrent(guard)) return;

          updateItem(key, {
            status: "registered",
            loadedBytes: file.size,
            error: null,
          });

          sessionStorage.removeItem(storageKey(actorId, intent.DocumentId));

          void queryClient.invalidateQueries({
            queryKey: documentKeys.collection(actorId, collectionId),
          });
          void queryClient.invalidateQueries({
            queryKey: collectionKeys.detail(actorId, collectionId),
          });
          toast.success("Đã tải và đăng ký " + file.name);
        } catch (error) {
          if (!isCurrent(guard)) return;
          updateItem(key, {
            status: "failed",
            error: error instanceof Error
              ? error.message
              : "Không thể tải tài liệu.",
          });
        }
      }
    } finally {
      runningRef.current = false;
      if (isCurrent(guard)) setRunning(false);
    }
  }, [actorId, collectionId, canAdd, currentSession, queryClient]);

  const retry = useCallback(async (documentId: string, file: File) => {
    const guard = currentSession.current;
    if (!actorId || !collectionId || guard.actorId !== actorId) return;

    const uploadSessionId = sessionStorage.getItem(
      storageKey(actorId, documentId)
    );
    if (!uploadSessionId) {
      toast.error("Không còn UploadSessionId. Hãy tạo upload intent mới.");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      await documentsApi.stage(uploadSessionId, file, () => undefined);
      await documentsApi.finalize(documentId);
      if (!isCurrent(guard)) return;

      sessionStorage.removeItem(storageKey(actorId, documentId));
      void queryClient.invalidateQueries({
        queryKey: documentKeys.collection(actorId, collectionId),
      });
      void queryClient.invalidateQueries({
        queryKey: collectionKeys.detail(actorId, collectionId),
      });
      toast.success("Đã đăng ký tài liệu");
    } catch (error) {
      if (isCurrent(guard)) {
        toast.error(error instanceof Error ? error.message : "Không thể retry.");
      }
    }
  }, [actorId, collectionId, currentSession, queryClient]);

  return { items, running, enqueueFiles, retry };
}
~~~

Retry phải dùng cùng UploadSessionId. Nếu browser mất sessionStorage hoặc file bytes, không tự tạo session mới cho document cũ.

## C-07. Download/delete mutations

**CREATE – FULL FILE:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.ts

~~~ts
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { documentsApi } from "../api/documents.api";
import { documentKeys } from "./document-query-keys";
import { collectionKeys } from "./collection-query-keys";
import { useKnowledgeHubSession } from "./KnowledgeHubCacheBoundary";

type DeleteArgs = {
  id: string;
  guard: ReturnType<typeof useKnowledgeHubSession>["current"];
};

export function useDocumentMutations(
  actorId: string | null,
  collectionId: string | null
) {
  const client = useQueryClient();
  const session = useKnowledgeHubSession();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const isCurrent = (guard: typeof session.current) =>
    mounted.current && guard === session.current;

  const capture = () => {
    const guard = session.current;
    if (!actorId || guard.actorId !== actorId) {
      throw new Error("Tài khoản đã thay đổi; vui lòng thử lại.");
    }
    return guard;
  };

  const remove = useMutation({
    mutationFn: (args: DeleteArgs) => documentsApi.remove(args.id),
    retry: false,
    onSuccess: (result, args) => {
      if (!isCurrent(args.guard) || !args.guard.actorId) return;

      if (collectionId) {
        void client.invalidateQueries({
          queryKey: documentKeys.collection(args.guard.actorId, collectionId),
        });
        void client.invalidateQueries({
          queryKey: collectionKeys.detail(args.guard.actorId, collectionId),
        });
      }

      if (result.CleanupStatus === "COMPLETED") {
        toast.success("Đã xóa tài liệu");
      } else {
        toast.warning(
          "Tài liệu đã được gỡ khỏi repository; dọn tệp gốc vẫn đang chờ."
        );
      }
    },
  });

  const deleteDocument = async (id: string) => {
    const guard = capture();
    const result = await remove.mutateAsync({ id, guard });
    return isCurrent(guard) ? result : null;
  };

  const downloadDocument = async (id: string, fileName: string) => {
    const guard = capture();
    try {
      const blob = await documentsApi.download(id);
      if (!isCurrent(guard)) return;

      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      if (isCurrent(guard)) {
        toast.error(
          error instanceof Error ? error.message : "Không thể tải tài liệu."
        );
      }
    }
  };

  return { remove, deleteDocument, downloadDocument };
}
~~~

## C-08. Tạo DocumentUploader và UploadProgressList

**CREATE:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.tsx

~~~tsx
import { useRef, useState } from "react";
import { CloudUpload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DocumentUploader({
  disabled,
  onFilesSelected,
}: {
  disabled: boolean;
  onFilesSelected: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <Card className="border-dashed bg-muted/40 py-0 shadow-none">
      <CardContent
        className={
          "flex flex-col items-center gap-3 p-7 text-center " +
          (dragging ? "ring-2 ring-primary" : "")
        }
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && event.dataTransfer.files.length) {
            onFilesSelected(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <div className="rounded-xl bg-background p-3">
          <CloudUpload className="size-7 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold">Kho tài liệu & Import</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Chọn hoặc kéo thả PDF, Markdown, TXT. Mỗi tệp tối đa 50 MiB.
        </p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.md,.txt"
          multiple
          className="sr-only"
          disabled={disabled}
          aria-label="Chọn tài liệu để tải lên"
          onChange={(event) => {
            if (event.currentTarget.files?.length) {
              onFilesSelected(Array.from(event.currentTarget.files));
            }
            event.currentTarget.value = "";
          }}
        />
        <Button disabled={disabled} onClick={() => input.current?.click()}>
          <FileText className="size-4" />
          Chọn tài liệu
        </Button>
      </CardContent>
    </Card>
  );
}
~~~

**CREATE:** src/apps/Blocks.Web/src/features/knowledgehub/components/UploadProgressList.tsx

~~~tsx
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { UploadQueueItem } from "../types/documents.types";

function formatBytes(value: number) {
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

export function UploadProgressList({ items }: { items: UploadQueueItem[] }) {
  if (!items.length) return null;

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tiến trình tải tài liệu</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.map((item) => {
          const percent = item.totalBytes
            ? Math.min(100, Math.round(item.loadedBytes / item.totalBytes * 100))
            : 0;

          return (
            <div key={item.key} className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.file.size)}
                  </p>
                </div>
                {item.status === "registered" && (
                  <Badge variant="secondary">
                    <CheckCircle2 className="mr-1 size-3" /> Đã đăng ký
                  </Badge>
                )}
                {item.status === "registering" && (
                  <Badge variant="secondary">
                    <Loader2 className="mr-1 size-3 animate-spin" /> Đang đăng ký
                  </Badge>
                )}
              </div>

              {item.status === "uploading" && (
                <>
                  <Progress value={percent} />
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.loadedBytes)} / {formatBytes(item.totalBytes)}
                    {" · "}{percent}%
                  </p>
                </>
              )}

              {item.status === "registering" && (
                <p className="text-xs text-muted-foreground">
                  Đã truyền bytes. Đang xác nhận và đăng ký tài liệu.
                </p>
              )}

              {item.error && (
                <p role="alert" className="text-xs text-destructive">
                  {item.error}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
~~~

## C-09. DocumentRow và DocumentDeleteDialog

**CREATE:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.tsx

~~~tsx
import { useRef } from "react";
import { Download, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DocumentDto } from "../types/documents.types";

function formatBytes(value: number) {
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

export function DocumentRow({
  document,
  canAdd,
  canDelete,
  onDownload,
  onDelete,
  onRetry,
}: {
  document: DocumentDto;
  canAdd: boolean;
  canDelete: boolean;
  onDownload: (item: DocumentDto) => void;
  onDelete: (item: DocumentDto) => void;
  onRetry: (item: DocumentDto, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const registered = document.RegistrationStatus === "REGISTERED";
  const retryable =
    document.RegistrationStatus === "AWAITING_UPLOAD" ||
    document.RegistrationStatus === "REGISTRATION_FAILED";

  const statusLabel = {
    AWAITING_UPLOAD: "Chờ tải lên",
    REGISTERING: "Đang đăng ký",
    REGISTRATION_FAILED: "Đăng ký thất bại",
    REGISTERED: "Đã lưu",
  }[document.RegistrationStatus];

  return (
    <tr>
      <td className="min-w-0 p-2">
        <p className="truncate font-medium">{document.Title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {document.OriginalFileName}
        </p>
      </td>
      <td className="p-2 uppercase">{document.FileExtension.replace(".", "")}</td>
      <td className="p-2">{formatBytes(document.SizeBytes)}</td>
      <td className="p-2">
        <Badge variant={registered ? "secondary" : "outline"}>{statusLabel}</Badge>
      </td>
      <td className="p-2 text-right">
        <div className="flex justify-end gap-1">
          {retryable && canAdd && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.md,.txt"
                className="sr-only"
                aria-label={"Chọn lại tệp " + document.Title}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onRetry(document, file);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={"Thử lại " + document.Title}
                onClick={() => inputRef.current?.click()}
              >
                <RefreshCw className="size-4" />
              </Button>
            </>
          )}
          {registered && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={"Tải xuống " + document.Title}
              onClick={() => onDownload(document)}
            >
              <Download className="size-4" />
            </Button>
          )}
          {registered && canDelete && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={"Xóa " + document.Title}
              onClick={() => onDelete(document)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
~~~

**CREATE:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.tsx

~~~tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DocumentDto } from "../types/documents.types";

export function DocumentDeleteDialog({
  target,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  target: DocumentDto | null;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa tài liệu?</DialogTitle>
          <DialogDescription>
            Tài liệu sẽ bị gỡ khỏi repository. Việc dọn tệp gốc có thể hoàn tất sau.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <p className="break-words text-sm font-medium">
            {target.OriginalFileName}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? "Đang xóa..." : "Xóa tài liệu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
~~~

## C-10. DocumentRepository – search/filter/paging từ server

**CREATE:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.tsx

Implementation bắt buộc:
- useState cho q, registration_status, page_index.
- useDocuments(actorId, collectionId, canView, params).
- ui/table, ui/input, ui/select, ui/button, ui/skeleton.
- Search chỉ title/original filename.
- page_index reset về 1 khi query/filter đổi.
- Download/delete gọi useDocumentMutations.
- Empty/loading/error state không dùng fake data.
- Chỉ REGISTERED mới hiện action download/delete.
- Dialog target là đúng DocumentDto được chọn.

Code khung component:

~~~tsx
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useDocuments } from "../hooks/useDocuments";
import { useDocumentMutations } from "../hooks/useDocumentMutations";
import { DocumentDeleteDialog } from "./DocumentDeleteDialog";
import { DocumentRow } from "./DocumentRow";
import type { DocumentDto, DocumentRegistrationStatus } from "../types/documents.types";

export function DocumentRepository({
  actorId, collectionId, canAdd, canView, canDelete, onRetry,
}: {
  actorId: string | null;
  collectionId: string | null;
  canAdd: boolean;
  canView: boolean;
  canDelete: boolean;
  onRetry: (documentId: string, file: File) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DocumentRegistrationStatus | "ALL">("ALL");
  const [pageIndex, setPageIndex] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DocumentDto | null>(null);

  const params = {
    q: query || undefined,
    registration_status: status === "ALL" ? undefined : status,
    page_index: pageIndex,
    page_size: 20,
  };

  const list = useDocuments(actorId, collectionId, canView, params);
  const mutations = useDocumentMutations(actorId, collectionId);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mutations.deleteDocument(deleteTarget.Id);
      setDeleteTarget(null);
    } catch {
      // mutation.error is shown in the dialog.
    }
  };

  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="size-4" />
          Tài liệu trong bộ sưu tập
        </CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              placeholder="Tìm theo tên tài liệu..."
              aria-label="Tìm tài liệu theo tên"
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(1);
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as DocumentRegistrationStatus | "ALL");
              setPageIndex(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Lọc trạng thái">
              <SelectValue placeholder="Tất cả trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              <SelectItem value="AWAITING_UPLOAD">Chờ tải lên</SelectItem>
              <SelectItem value="REGISTERING">Đang đăng ký</SelectItem>
              <SelectItem value="REGISTRATION_FAILED">Đăng ký thất bại</SelectItem>
              <SelectItem value="REGISTERED">Đã lưu</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isLoading && (
          <div className="grid gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {list.isError && (
          <div role="alert" className="grid gap-2 text-sm">
            <p>Không thể tải danh sách tài liệu.</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {list.isSuccess && list.data.Data.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chưa có tài liệu phù hợp trong bộ sưu tập này.
          </div>
        )}

        {list.isSuccess && list.data.Data.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tài liệu</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Dung lượng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.Data.map((item) => (
                  <DocumentRow
                    key={item.Id}
                    document={item}
                    canAdd={canAdd}
                    canDelete={canDelete}
                    onDownload={(doc) =>
                      void mutations.downloadDocument(doc.Id, doc.OriginalFileName)
                    }
                    onDelete={setDeleteTarget}
                    onRetry={(doc, file) => onRetry(doc.Id, file)}
                  />
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Trang {list.data.PageIndex} · {list.data.TotalRow} tài liệu
              </p>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Trang trước"
                  disabled={pageIndex <= 1 || list.isFetching}
                  onClick={() => setPageIndex((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Trang sau"
                  disabled={
                    pageIndex >= Math.max(1, Math.ceil(list.data.TotalRow / list.data.PageSize)) ||
                    list.isFetching
                  }
                  onClick={() => setPageIndex((value) => value + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <DocumentDeleteDialog
        target={deleteTarget}
        pending={mutations.remove.isPending}
        error={mutations.remove.error?.message ?? null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
~~~

## C-11. Thay RepositoryFrame và nối KnowledgeHubPage

**File:** src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx

Thay toàn bộ placeholder bằng:

~~~tsx
import { useDocumentUploads } from "../hooks/useDocumentUploads";
import { CollectionState, type CollectionContentState } from "./CollectionState";
import { DocumentUploader } from "./DocumentUploader";
import { UploadProgressList } from "./UploadProgressList";
import { DocumentRepository } from "./DocumentRepository";

export function RepositoryFrame({
  state,
  actorId,
  collectionId,
  canAdd,
  canView,
  canDelete,
}: {
  state: CollectionContentState;
  actorId: string | null;
  collectionId: string | null;
  canAdd: boolean;
  canView: boolean;
  canDelete: boolean;
}) {
  const uploads = useDocumentUploads(actorId, collectionId, canAdd);

  if (state !== "ready") return <CollectionState state={state} />;

  return (
    <div className="grid min-w-0 gap-5">
      <DocumentUploader
        disabled={!canAdd || uploads.running}
        onFilesSelected={(files) => void uploads.enqueueFiles(files)}
      />
      <UploadProgressList items={uploads.items} />
      <DocumentRepository
        actorId={actorId}
        collectionId={collectionId}
        canAdd={canAdd}
        canView={canView}
        canDelete={canDelete}
        onRetry={(documentId, file) => {
          void uploads.retry(documentId, file);
        }}
      />
    </div>
  );
}
~~~

**File:** src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx

Tìm:

~~~tsx
<RepositoryFrame state={state} />
~~~

Thay bằng:

~~~tsx
<RepositoryFrame
  state={state}
  actorId={actorId}
  collectionId={selectedId}
  canAdd={canCreate}
  canView={canView}
  canDelete={canDelete}
/>
~~~

Không thay selector, collection CRUD, tabs, AskResearchFrame, selection hook hoặc MainLayout.

**File:** src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts

Thay:

~~~ts
DocumentCount: number; // Always 0 in P02
~~~

bằng:

~~~ts
DocumentCount: number;
~~~

**File:** src/apps/Blocks.Web/src/Router.tsx

Source hiện tại đang mount trực tiếp:

~~~tsx
<Route path="/knowledgehub" element={<KnowledgeHubPage />} />
~~~

P02 hooks đã dùng useKnowledgeHubSession, nên route phải được bọc bởi KnowledgeHubCacheBoundary. Nếu không, useCollectionMutations và P03 hooks không có session context.

**MODIFY – INSERT:** thêm import:

~~~tsx
import { KnowledgeHubCacheBoundary } from "./features/knowledgehub/hooks/KnowledgeHubCacheBoundary";
~~~

**MODIFY – REPLACE ROUTE:**

~~~tsx
<Route
  path="/knowledgehub"
  element={
    <KnowledgeHubCacheBoundary>
      <KnowledgeHubPage />
    </KnowledgeHubCacheBoundary>
  }
/>
~~~

## C-12. Tests và visual acceptance

### API tests
- Success=false trong HTTP 200 bị reject.
- FormData có đúng files và FolderName.
- X-Upload-Purpose là request header.
- JSON Content-Type bị xóa cho FormData.
- Download Blob JSON error envelope bị unwrap.
- timeout/signal/progress được truyền qua Axios.

### Hook tests
- Actor A và Actor B có query key khác nhau.
- Collection A và Collection B có query key khác nhau.
- Không gọi API nếu thiếu actor/collection/VIEW.
- Upload queue chỉ có một stage request active tại một thời điểm.
- Progress dựa trên onUploadProgress.
- 100% transfer không đồng nghĩa registered.
- finalize success mới invalidate document list và collection detail.
- Actor A pending -> actor B login -> A response resolve: không toast/invalidate cache B.
- Retry giữ nguyên UploadSessionId.

### Component tests
- file picker/drop zone nhận PDF/MD/TXT.
- file sai extension hoặc >50 MiB hiển thị lỗi.
- empty/loading/error state.
- filter/search/page gọi server params.
- non-registered không có download/delete.
- delete dialog không đóng khi pending.
- cleanup PENDING/FAILED hiển thị cảnh báo, không nói document delete thất bại.

### Visual review
Compare với docs/knowledgehub/references/stitch_blocks_interface/screen.png:
- 1280x1024, zoom 100%, DPR 1.
- 1440x900.
- 390x844.

Capture:
1. Collection rỗng thật.
2. Uploader idle/dragging.
3. Upload đang truyền bytes.
4. Upload 100% nhưng đang registering.
5. Failed/retry.
6. Document row thật.
7. Search/filter/paging.
8. Delete dialog và cleanup pending warning.

Giữ hierarchy MainLayout -> collection selector/count -> tabs -> repository frame. Không thêm second sidebar, fake documents, fake progress, AI answer modal hoặc READY.

~~~powershell
npm --prefix src/apps/Blocks.Web test -- src/features/knowledgehub
npm --prefix src/apps/Blocks.Web test
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
git diff --check
~~~

