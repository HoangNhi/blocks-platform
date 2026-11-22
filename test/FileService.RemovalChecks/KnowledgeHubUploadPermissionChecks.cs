using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Blocks.FileService.Configs;
using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Infrastructure.Filters;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.FileService.Middlewares;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

internal static class KnowledgeHubUploadPermissionChecks
{
    private const string JwtSecret = "super_secret_test_key_for_kh_permission_checks_32b!";
    private const string JwtIssuer = "TestKhIssuer";
    private const string JwtAudience = "TestKhAudience";

    internal static async Task RunAsync(Func<string, Func<Task>, Task> check)
    {
        await check("kh_legacy_no_purpose", CheckLegacyNoPurposeAsync);
        await check("kh_unknown_purpose", CheckUnknownPurposeAsync);
        await check("kh_missing_actor_claim", CheckMissingActorClaimAsync);
        await check("kh_add_allowed", CheckAddAllowedAsync);
        await check("kh_add_denied", CheckAddDeniedAsync);
        await check("kh_permission_unavailable", CheckPermissionUnavailableAsync);
        await check("kh_permission_unauthenticated", CheckPermissionUnauthenticatedAsync);
        await check("kh_permission_timeout", CheckPermissionTimeoutAsync);
        await check("kh_no_temp_on_denied", CheckNoTempOnDeniedAsync);
        await check("kh_same_session_same_content", CheckSameSessionSameContentAsync);
        await check("kh_same_session_different_content", CheckSameSessionDifferentContentAsync);
        await check("kh_old_manifest", CheckOldManifestAsync);
        await check("kh_target_knowledgehub", CheckKnowledgeHubTargetAsync);
        await check("kh_wrong_target", CheckWrongTargetAsync);
        await check("kh_delete_receipt", CheckDeleteReceiptAsync);
        await check("kh_legacy_regression", CheckLegacyRegressionAsync);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private sealed class FakePermissionClient : IKnowledgeHubUploadPermissionClient
    {
        private readonly Func<Guid, string, CancellationToken, Task<bool>> _handler;
        public int CallCount { get; private set; }

        public FakePermissionClient(Func<Guid, string, CancellationToken, Task<bool>> handler)
        {
            _handler = handler;
        }

        public Task<bool> CheckAddPermissionAsync(Guid actorId, string bearerToken, CancellationToken cancellationToken)
        {
            CallCount++;
            return _handler(actorId, bearerToken, cancellationToken);
        }
    }

    private sealed class FakeAuditWriter : IuploadAttemptAuditWriter
    {
        public List<(Guid ActorId, string SafeMessage)> Calls { get; } = new();

        public Task WriteDeniedAsync(HttpContext context, Guid actorId, string safeMessage)
        {
            Calls.Add((actorId, safeMessage));
            return Task.CompletedTask;
        }
    }

    private static AuthorizationFilterContext CreateFilterContext(
        string? purposeHeader = null,
        bool authenticated = true,
        string? actorNameClaim = null,
        string? authorizationHeader = "Bearer test-token")
    {
        var httpContext = new DefaultHttpContext();
        if (purposeHeader != null)
        {
            httpContext.Request.Headers[KnowledgeHubUploadPermissionFilter.PurposeHeader] = purposeHeader;
        }

        if (authorizationHeader != null)
        {
            httpContext.Request.Headers.Authorization = authorizationHeader;
        }

        if (authenticated)
        {
            var claims = new List<Claim>();
            if (actorNameClaim != null)
            {
                claims.Add(new Claim("name", actorNameClaim));
            }

            httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        }

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());

        return new AuthorizationFilterContext(actionContext, new List<IFilterMetadata>());
    }

    private static BaseResponse ExtractEnvelope(IActionResult? result)
    {
        Require(result is ObjectResult, $"Expected ObjectResult, got {result?.GetType().Name ?? "null"}");
        var obj = (ObjectResult)result!;
        Require(obj.Value is BaseResponse, $"Expected BaseResponse value, got {obj.Value?.GetType().Name ?? "null"}");
        return (BaseResponse)obj.Value!;
    }

    private static async Task CheckLegacyNoPurposeAsync()
    {
        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(false));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: null,
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        Require(ctx.Result == null, "Legacy request without X-Upload-Purpose must not short-circuit");
        Require(perm.CallCount == 0, "Permission client must not be called for legacy requests");
        Require(!ctx.HttpContext.Items.ContainsKey(KnowledgeHubUploadPermissionFilter.ValidatedPurposeItem),
            "ValidatedUploadPurpose must not be set for legacy requests");
    }

    private static async Task CheckUnknownPurposeAsync()
    {
        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(true));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: "OtherPurpose",
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        var env = ExtractEnvelope(ctx.Result);
        Require(!env.Success && env.StatusCode == 400, $"Expected envelope 400, got Success={env.Success}, StatusCode={env.StatusCode}");
        Require(perm.CallCount == 0, "Permission client must not be called on unknown purpose");
    }

    private static async Task CheckMissingActorClaimAsync()
    {
        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(true));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        foreach (var badClaim in new string?[] { null, "", "not-a-guid", Guid.Empty.ToString("D") })
        {
            var ctx = CreateFilterContext(
                purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
                authenticated: true,
                actorNameClaim: badClaim);

            await filter.OnAuthorizationAsync(ctx);

            var env = ExtractEnvelope(ctx.Result);
            Require(!env.Success && env.StatusCode == 401,
                $"Expected envelope 401 for claim '{badClaim}', got {env.StatusCode}");
            Require(perm.CallCount == 0, "Permission client must not be called when actor claim is missing/invalid");
        }
    }

    private static async Task CheckAddAllowedAsync()
    {
        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(true));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        Require(ctx.Result == null, "Allowed upload must not set ctx.Result");
        Require(perm.CallCount == 1, $"Permission client must be called once, got {perm.CallCount}");
        Require(ctx.HttpContext.Items.TryGetValue(KnowledgeHubUploadPermissionFilter.ValidatedPurposeItem, out var val) &&
                Equals(val, KnowledgeHubUploadPermissionFilter.PurposeValue),
            "Items[ValidatedUploadPurpose] must equal KnowledgeHubDocument");
        Require(audit.Calls.Count == 0, "Audit writer must not be called when allowed");
    }

    private static async Task CheckAddDeniedAsync()
    {
        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(false));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var actorId = Guid.NewGuid();
        var ctx = CreateFilterContext(
            purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
            authenticated: true,
            actorNameClaim: actorId.ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        var env = ExtractEnvelope(ctx.Result);
        Require(!env.Success && env.StatusCode == 403, $"Expected envelope 403, got {env.StatusCode}");
        Require(audit.Calls.Count == 1 && audit.Calls[0].ActorId == actorId, "Denied audit must be called once");
    }

    private static async Task CheckPermissionUnavailableAsync()
    {
        var perm = new FakePermissionClient((_, _, _) =>
            throw new RpcException(new Status(StatusCode.Unavailable, "down")));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        var env = ExtractEnvelope(ctx.Result);
        Require(!env.Success && env.StatusCode == 503, $"Expected envelope 503, got {env.StatusCode}");
        Require(audit.Calls.Count == 1, "Audit writer must be called on unavailable");
    }

    private static async Task CheckPermissionUnauthenticatedAsync()
    {
        var perm = new FakePermissionClient((_, _, _) =>
            throw new RpcException(new Status(StatusCode.Unauthenticated, "invalid token")));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        var env = ExtractEnvelope(ctx.Result);
        Require(!env.Success && env.StatusCode == 401, $"Expected envelope 401, got {env.StatusCode}");
    }

    private static async Task CheckPermissionTimeoutAsync()
    {
        var perm = new FakePermissionClient((_, _, _) =>
            throw new RpcException(new Status(StatusCode.DeadlineExceeded, "timeout")));
        var audit = new FakeAuditWriter();
        var filter = new KnowledgeHubUploadPermissionFilter(
            perm,
            audit,
            NullLogger<KnowledgeHubUploadPermissionFilter>.Instance);

        var ctx = CreateFilterContext(
            purposeHeader: KnowledgeHubUploadPermissionFilter.PurposeValue,
            authenticated: true,
            actorNameClaim: Guid.NewGuid().ToString("D"));

        await filter.OnAuthorizationAsync(ctx);

        var env = ExtractEnvelope(ctx.Result);
        Require(!env.Success && env.StatusCode == 503, $"Expected envelope 503, got {env.StatusCode}");
    }

    private static string CreateJwt(Guid actorId)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D")),
                new Claim("unique_name", "kh_test_user")
            }),
            NotBefore = DateTime.UtcNow.AddMinutes(-1),
            Expires = DateTime.UtcNow.AddHours(1),
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSecret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        return tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
    }

    private static async Task CheckNoTempOnDeniedAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var root = Path.Combine(tempRoot, $"blocks-kh-notemp-{Guid.NewGuid():N}");
        var webRoot = Path.Combine(root, "wwwroot");
        var storageRoot = Path.Combine(root, "storage");
        Directory.CreateDirectory(webRoot);
        Directory.CreateDirectory(storageRoot);

        var perm = new FakePermissionClient((_, _, _) => Task.FromResult(false));
        var audit = new FakeAuditWriter();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production",
            ContentRootPath = root,
            WebRootPath = webRoot
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GrpcClients:SystemService"] = "https://127.0.0.1:1",
            ["FileStorage:RootPath"] = storageRoot,
            ["Jwt:Issuer"] = JwtIssuer,
            ["Jwt:Audience"] = JwtAudience,
            ["Jwt:Key"] = JwtSecret
        });

        builder.Services.AddControllers()
            .AddApplicationPart(typeof(Blocks.FileService.Controllers.UploadFileController).Assembly)
            .AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);
        builder.ExecuteConfigService();
        builder.ExecuteConfigAuthentication();
        builder.Services.RemoveAll<IKnowledgeHubUploadPermissionClient>();
        builder.Services.RemoveAll<IuploadAttemptAuditWriter>();
        builder.Services.AddSingleton<IKnowledgeHubUploadPermissionClient>(perm);
        builder.Services.AddSingleton<IuploadAttemptAuditWriter>(audit);

        await using var app = builder.Build();
        app.UseMiddleware<GlobalExceptionHandler>();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        await app.StartAsync();

        try
        {
            var baseUrl = app.Urls.First();
            using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
            var actorId = Guid.NewGuid();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateJwt(actorId));
            client.DefaultRequestHeaders.Add(KnowledgeHubUploadPermissionFilter.PurposeHeader,
                KnowledgeHubUploadPermissionFilter.PurposeValue);

            var sessionId = Guid.NewGuid();
            using var multipart = new MultipartFormDataContent();
            var content = new ByteArrayContent(Encoding.UTF8.GetBytes("# denied doc"));
            content.Headers.ContentType = new MediaTypeHeaderValue("text/markdown");
            multipart.Add(content, "files", "denied.md");
            multipart.Add(new StringContent(sessionId.ToString("D")), "FolderName");

            using var resp = await client.PostAsync("/api/UploadFile", multipart);
            var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
            Require(env != null && !env.Success && env.StatusCode == 403,
                $"Expected 403 envelope, got Success={env?.Success}, StatusCode={env?.StatusCode}");
            Require(audit.Calls.Count == 1, "Audit writer must be called once on denied HTTP upload");

            var tempArea = Path.Combine(storageRoot, "Temp");
            var entries = Directory.Exists(tempArea)
                ? Directory.GetFileSystemEntries(tempArea, "*", SearchOption.AllDirectories)
                : Array.Empty<string>();
            Require(entries.Length == 0, $"Temp area must remain empty on denied upload, found {entries.Length} entries");
        }
        finally
        {
            await app.StopAsync();
            if (Directory.Exists(root))
            {
                Directory.Delete(root, true);
            }
        }
    }

    private sealed class ServiceHarness : IAsyncDisposable
    {
        public string Root { get; }
        public string StorageRoot { get; }
        public WebApplication App { get; }
        public IServiceScope Scope { get; }
        public IUploadFileService UploadService { get; }
        public UploadSessionStore Sessions { get; }
        public FileStorage Storage { get; }
        public Guid ActorId { get; }

        private ServiceHarness(string root, string storageRoot, WebApplication app, Guid actorId)
        {
            Root = root;
            StorageRoot = storageRoot;
            App = app;
            ActorId = actorId;
            Scope = app.Services.CreateScope();
            var accessor = Scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
            accessor.HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", actorId.ToString("D"))
                }, "TestAuth"))
            };
            UploadService = Scope.ServiceProvider.GetRequiredService<IUploadFileService>();
            Sessions = Scope.ServiceProvider.GetRequiredService<UploadSessionStore>();
            Storage = Scope.ServiceProvider.GetRequiredService<FileStorage>();
        }

        public static ServiceHarness Create()
        {
            var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
            var root = Path.Combine(tempRoot, $"blocks-kh-svc-{Guid.NewGuid():N}");
            var webRoot = Path.Combine(root, "wwwroot");
            var storageRoot = Path.Combine(root, "storage");
            Directory.CreateDirectory(webRoot);
            Directory.CreateDirectory(storageRoot);

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = "Production",
                ContentRootPath = root,
                WebRootPath = webRoot
            });
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrpcClients:SystemService"] = "https://127.0.0.1:1",
                ["FileStorage:RootPath"] = storageRoot
            });
            builder.ExecuteConfigService();
            var app = builder.Build();
            return new ServiceHarness(root, storageRoot, app, Guid.NewGuid());
        }

        public async ValueTask DisposeAsync()
        {
            Scope.Dispose();
            await App.DisposeAsync();
            if (Directory.Exists(Root))
            {
                Directory.Delete(Root, true);
            }
        }
    }

    private static IFormFile CreateFormFile(string fileName, byte[] bytes)
    {
        var stream = new MemoryStream(bytes);
        return new FormFile(stream, 0, bytes.Length, "files", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };
    }

    private static async Task CheckSameSessionSameContentAsync()
    {
        await using var h = ServiceHarness.Create();
        var sessionId = Guid.NewGuid().ToString("D");
        var bytes = Encoding.UTF8.GetBytes("# Hello KnowledgeHub\nSame content.");

        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("doc.md", bytes) },
            sessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        var sessionDir = h.Storage.ResolveSession(h.ActorId, Guid.ParseExact(sessionId, "D"));
        var manifestPath = Path.Combine(sessionDir, "manifest.json");
        var beforeManifest = await File.ReadAllTextAsync(manifestPath);
        var beforeSession = await h.Sessions.ReadAsync(h.ActorId, Guid.ParseExact(sessionId, "D"), CancellationToken.None);
        Require(beforeSession != null && beforeSession.Purpose == KnowledgeHubUploadPermissionFilter.PurposeValue,
            "Staged manifest must persist KnowledgeHubDocument Purpose");

        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("doc.md", bytes) },
            sessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        var afterManifest = await File.ReadAllTextAsync(manifestPath);
        var afterSession = await h.Sessions.ReadAsync(h.ActorId, Guid.ParseExact(sessionId, "D"), CancellationToken.None);
        Require(afterSession != null && afterSession.BatchId == beforeSession.BatchId,
            "Same-session same-content retry must keep existing batch");
        Require(afterManifest == beforeManifest,
            "Same-session same-content retry must not rewrite manifest");
    }

    private static async Task CheckSameSessionDifferentContentAsync()
    {
        await using var h = ServiceHarness.Create();
        var sessionId = Guid.NewGuid().ToString("D");
        var originalBytes = Encoding.UTF8.GetBytes("Original content");
        var modifiedBytes = Encoding.UTF8.GetBytes("Different content");

        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("doc.txt", originalBytes) },
            sessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        var beforeSession = await h.Sessions.ReadAsync(h.ActorId, Guid.ParseExact(sessionId, "D"), CancellationToken.None);
        Require(beforeSession != null, "Initial session must exist");

        BusinessException? caught = null;
        try
        {
            await h.UploadService.Insert(
                new List<IFormFile> { CreateFormFile("doc.txt", modifiedBytes) },
                sessionId,
                CancellationToken.None,
                KnowledgeHubUploadPermissionFilter.PurposeValue);
        }
        catch (BusinessException ex)
        {
            caught = ex;
        }

        Require(caught != null && caught.StatusCode == 409,
            $"Expected 409 on different content in same session, got {caught?.StatusCode}");

        var afterSession = await h.Sessions.ReadAsync(h.ActorId, Guid.ParseExact(sessionId, "D"), CancellationToken.None);
        Require(afterSession != null && afterSession.BatchId == beforeSession!.BatchId,
            "Existing batch must remain intact after 409");
        var batchPath = h.Storage.Resolve(
            StorageArea.Temp,
            h.ActorId.ToString("D"),
            sessionId,
            "batches",
            beforeSession!.BatchId.ToString("D"),
            $"{beforeSession.Files[0].Id:D}.txt");
        Require(File.Exists(batchPath) && (await File.ReadAllBytesAsync(batchPath)).SequenceEqual(originalBytes),
            "Original staged file bytes must remain intact");
    }

    private static async Task CheckOldManifestAsync()
    {
        await using var h = ServiceHarness.Create();
        var folderId = Guid.NewGuid();
        var batchId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var dummySha = new string('a', 64);

        var legacyJson = JsonSerializer.Serialize(new
        {
            ActorId = h.ActorId,
            FolderId = folderId,
            BatchId = batchId,
            CreatedAt = DateTimeOffset.UtcNow,
            State = "Staged",
            Files = new[]
            {
                new
                {
                    Id = fileId,
                    OriginalName = "legacy.txt",
                    Extension = ".txt",
                    Length = 12L,
                    Sha256 = dummySha
                }
            },
            Target = (object?)null,
            Result = (object?)null
        });

        var sessionDir = h.Storage.ResolveSession(h.ActorId, folderId);
        Directory.CreateDirectory(sessionDir);
        await File.WriteAllTextAsync(Path.Combine(sessionDir, "manifest.json"), legacyJson);

        var session = await h.Sessions.ReadAsync(h.ActorId, folderId, CancellationToken.None);
        Require(session != null && session.Purpose == null,
            $"Old manifest without Purpose must deserialize with Purpose=null, got '{session?.Purpose}'");
    }

    private static async Task CheckKnowledgeHubTargetAsync()
    {
        await using var h = ServiceHarness.Create();
        var sessionId = Guid.NewGuid().ToString("D");
        var documentId = Guid.NewGuid().ToString("D");
        var bytes = Encoding.UTF8.GetBytes("# KnowledgeHub Document\nContent.");
        var expectedSha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("guide.md", bytes) },
            sessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        var finalized = await h.UploadService.UploadDataWithMetadataAsync(
            documentId,
            "KnowledgeHub",
            "Documents",
            sessionId,
            CancellationToken.None);

        Require(finalized.Count == 1, $"Expected 1 finalized attachment, got {finalized.Count}");
        var item = finalized[0];
        var segments = item.Attachment.FileUrl.Split('/');
        Require(segments.Length == 4 &&
                segments[0] == "KnowledgeHub" &&
                segments[1] == "Documents" &&
                segments[2] == documentId,
            $"Expected 4-segment KnowledgeHub key, got '{item.Attachment.FileUrl}'");
        Require(item.SourceSha256 == expectedSha,
            $"Expected sha256 '{expectedSha}', got '{item.SourceSha256}'");
        var physicalPath = h.Storage.ResolveActiveKey(item.Attachment.FileUrl);
        Require(File.Exists(physicalPath), "Finalized physical file must exist");
    }

    private static async Task CheckWrongTargetAsync()
    {
        await using var h = ServiceHarness.Create();

        // Case 1: KH manifest finalized into System/Attachments -> 409
        var khSessionId = Guid.NewGuid().ToString("D");
        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("kh.md", Encoding.UTF8.GetBytes("kh")) },
            khSessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        BusinessException? khToSystemEx = null;
        try
        {
            await h.UploadService.UploadDataWithMetadataAsync(
                Guid.NewGuid().ToString("D"),
                "System",
                "Attachments",
                khSessionId,
                CancellationToken.None);
        }
        catch (BusinessException ex)
        {
            khToSystemEx = ex;
        }
        Require(khToSystemEx != null && khToSystemEx.StatusCode == 409,
            $"Expected 409 when finalizing KH manifest to System/Attachments, got {khToSystemEx?.StatusCode}");

        // Case 2: Legacy manifest (Purpose=null) finalized into KnowledgeHub/Documents -> 409
        var legacySessionId = Guid.NewGuid().ToString("D");
        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("legacy.txt", Encoding.UTF8.GetBytes("legacy")) },
            legacySessionId,
            CancellationToken.None,
            null);

        BusinessException? systemToKhEx = null;
        try
        {
            await h.UploadService.UploadDataWithMetadataAsync(
                Guid.NewGuid().ToString("D"),
                "KnowledgeHub",
                "Documents",
                legacySessionId,
                CancellationToken.None);
        }
        catch (BusinessException ex)
        {
            systemToKhEx = ex;
        }
        Require(systemToKhEx != null && systemToKhEx.StatusCode == 409,
            $"Expected 409 when finalizing legacy manifest to KnowledgeHub/Documents, got {systemToKhEx?.StatusCode}");
    }

    private static async Task CheckDeleteReceiptAsync()
    {
        await using var h = ServiceHarness.Create();
        var sessionId = Guid.NewGuid().ToString("D");
        var documentId = Guid.NewGuid().ToString("D");
        var bytes = Encoding.UTF8.GetBytes("To be deleted");

        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("delete-me.txt", bytes) },
            sessionId,
            CancellationToken.None,
            KnowledgeHubUploadPermissionFilter.PurposeValue);

        var finalized = await h.UploadService.UploadDataWithMetadataAsync(
            documentId,
            "KnowledgeHub",
            "Documents",
            sessionId,
            CancellationToken.None);

        var key = finalized[0].Attachment.FileUrl;
        var physicalPath = h.Storage.ResolveActiveKey(key);
        Require(File.Exists(physicalPath), "File must exist before deletion");

        var deleted = await h.UploadService.DeleteDataAsync(new[] { key }, CancellationToken.None);
        Require(deleted, "DeleteDataAsync must return true");
        Require(!File.Exists(physicalPath), "Physical file must be removed after deletion");

        BusinessException? retryEx = null;
        try
        {
            await h.UploadService.UploadDataWithMetadataAsync(
                documentId,
                "KnowledgeHub",
                "Documents",
                sessionId,
                CancellationToken.None);
        }
        catch (BusinessException ex)
        {
            retryEx = ex;
        }

        Require(retryEx != null && retryEx.StatusCode == 409,
            $"Expected 409 when retrying finalize after delete, got {retryEx?.StatusCode}");
        Require(!File.Exists(physicalPath), "Physical file must not be recreated on retry after delete");
    }

    private static async Task CheckLegacyRegressionAsync()
    {
        await using var h = ServiceHarness.Create();

        // Legacy Attachment flow
        var attachSessionId = Guid.NewGuid().ToString("D");
        var relatedId = Guid.NewGuid().ToString("D");
        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("note.txt", Encoding.UTF8.GetBytes("legacy attachment")) },
            attachSessionId,
            CancellationToken.None,
            null);

        var attachResult = await h.UploadService.UploadDataAsync(
            relatedId,
            "System",
            "Attachments",
            attachSessionId,
            CancellationToken.None);
        Require(attachResult.Count == 1 && attachResult[0].FileUrl.StartsWith($"System/Attachments/{relatedId}/", StringComparison.Ordinal),
            "Legacy attachment upload must still finalize to System/Attachments");

        // Legacy Avatar flow (valid minimal PNG header)
        var avatarSessionId = Guid.NewGuid().ToString("D");
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };
        await h.UploadService.Insert(
            new List<IFormFile> { CreateFormFile("avatar.png", pngBytes) },
            avatarSessionId,
            CancellationToken.None,
            null);

        var avatarKey = await h.UploadService.UploadAvatarAsync(avatarSessionId, CancellationToken.None);
        Require(avatarKey.StartsWith("System/Avatar/", StringComparison.Ordinal) && avatarKey.EndsWith(".png", StringComparison.Ordinal),
            $"Legacy avatar upload must still finalize to System/Avatar, got '{avatarKey}'");
    }
}
