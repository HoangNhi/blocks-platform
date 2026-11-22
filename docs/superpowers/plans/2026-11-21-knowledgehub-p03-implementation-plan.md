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
    string.IsNullOrWhiteSpace(jwtKey) ||
    Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException(
        "FileService requires configured Jwt:Issuer, Jwt:Audience, and a Jwt:Key of at least 32 UTF-8 bytes.");
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

    if (session.Purpose is not null and not "KnowledgeHubDocument")
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

