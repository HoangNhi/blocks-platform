using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Runtime.Versioning;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Blocks.FileService;
using Blocks.FileService.Controllers;
using Blocks.FileService.Protos;
using Blocks.Shared.DTOs.Base;
using Google.Protobuf.Reflection;
using Grpc.AspNetCore.Server;
using Grpc.Core;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

using EphemeralAuditResponder = FileBoundaryChecks.EphemeralAuditResponder;

internal static class UpgradeChecks
{
    private const string JwtSecret = "super_secret_test_key_for_file_upgrade_checks_32_bytes!";
    private const string JwtIssuer = "TestUpgradeIssuer";
    private const string JwtAudience = "TestUpgradeAudience";

    internal static async Task RunAsync(Func<string, Func<Task>, Task> check)
    {
        await check("audit_retry_success_and_terminal_failure_keep_baseline", CheckAuditRetryAndFailureBaselineAsync);
        await check("file_assembly_target_and_harness_runtime", CheckAssemblyTargetAndRuntimeAsync);
        await check("file_swagger_multipart_schema", CheckSwaggerMultipartSchemaAsync);
        await check("file_limits_and_descriptor_unchanged", CheckLimitsAndDescriptorUnchangedAsync);
        await check("grpc_web_auth_header_and_version", CheckGrpcWebAuthHeaderAndVersionAsync);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static string CreateJwt(Guid actorId, string username = "testuser")
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var expires = DateTime.UtcNow.AddHours(1);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D")),
                new Claim("unique_name", username)
            }),
            NotBefore = DateTime.UtcNow,
            Expires = expires,
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSecret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private static async Task CheckAuditRetryAndFailureBaselineAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));

        // Case 1: Retry success (call 1 fails with grpc-status 14, call 2 succeeds with grpc-status 0)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? StatusCode.Unavailable : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-retry-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_retry_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 10, 20, 30 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "retry_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");
                var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
                Require(env?.Success == true, "upload application success");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");

                var reqs = responder.ReceivedRequests;
                Require(reqs.Count > 0, "at least one request payload captured");
                var lastReq = reqs.Last();
                Require(lastReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(lastReq.UserName == "file_retry_actor", "actor UserName matches JWT claim");
                Require(lastReq.ServiceName == "FileService", "ServiceName is FileService");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 2: Terminal failure (all calls fail with grpc-status 14 -> 3 retries, total 4 attempts)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(_ => StatusCode.Unavailable);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-terminal-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_terminal_actor");

            var logSink = new TestLogSink();
            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            fileApp.Services.GetRequiredService<ILoggerFactory>().AddProvider(logSink);
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 40, 50, 60 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "terminal_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200 despite audit failure");
                var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
                Require(env?.Success == true, "upload application success");

                // Wait for all 4 attempts (1 initial + 3 retries: 2s + 4s + 8s = 14s total wait)
                var completedAllAttempts = await responder.WaitForCallsAsync(4, TimeSpan.FromSeconds(30));
                Require(completedAllAttempts, $"expected 4 transport attempts before terminal giveup, got {responder.AuditCalls}");
                Require(responder.AuditCalls == 4, $"total transport attempts must be exactly 4, got {responder.AuditCalls}");

                // Wait for logger to capture terminal log
                var sw = Stopwatch.StartNew();
                while (sw.Elapsed < TimeSpan.FromSeconds(5) && !logSink.HasMessage("AUDIT LOG LOST"))
                {
                    await Task.Delay(50);
                }
                Require(logSink.HasMessage("AUDIT LOG LOST"), "terminal failure must log AUDIT LOG LOST");

                var reqs = responder.ReceivedRequests;
                Require(reqs.Count > 0, "request payload captured on terminal failure");
                var firstReq = reqs[0];
                Require(firstReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(firstReq.UserName == "file_terminal_actor", "actor UserName matches JWT claim");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 3: Upstream HTTP 503 then HTTP 200 (resilience characterization)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)503 : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-503-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_503_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 70, 80 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "503_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after HTTP 503");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 4: Connection disconnect/abort then HTTP 200
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? (StatusCode)999 : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-abort-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_abort_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(new byte[] { 90, 100 });
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                multipart.Add(fileContent, "files", "abort_test.txt");
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "upload HTTP 200");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry after connection abort");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }

        // Case 5: Failed action audit retry success (action fails, audit retries and succeeds on attempt 2)
        {
            await using var responder = await EphemeralAuditResponder.StartAsync(callIndex =>
                callIndex == 1 ? StatusCode.Unavailable : StatusCode.OK);

            var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-failed-action-{Guid.NewGuid():N}");
            var storageDir = Path.Combine(fixtureDir, "storage");
            Directory.CreateDirectory(storageDir);

            var actorId = Guid.NewGuid();
            var jwt = CreateJwt(actorId, "file_failed_action_actor");

            var fileApp = FileServiceHost.Build(new[]
            {
                "--urls", "http://127.0.0.1:0",
                "--GrpcClients:SystemService", responder.Url,
                "--contentRoot", fixtureDir,
                "--FileStorage:RootPath", storageDir,
                "--Jwt:Issuer", JwtIssuer,
                "--Jwt:Audience", JwtAudience,
                "--Jwt:Key", JwtSecret,
                "--Environment", "Production"
            });
            await fileApp.StartAsync();
            var baseUrl = fileApp.Urls.First();

            try
            {
                using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

                var folderGuid = Guid.NewGuid();
                using var multipart = new MultipartFormDataContent();
                // No files -> Insert throws BusinessException("Danh sách tệp rỗng", 400)
                multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

                using var resp = await client.PostAsync("/api/UploadFile", multipart);
                Require(resp.IsSuccessStatusCode, "HTTP envelope retained on business failure");
                var env = await resp.Content.ReadFromJsonAsync<BaseResponse>();
                Require(env?.Success == false, "application failure returned");

                var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
                Require(delivered, "audit delivered on retry for failed action");
                Require(responder.AuditCalls == 2, $"transport attempts must be 2, got {responder.AuditCalls}");

                var reqs = responder.ReceivedRequests;
                Require(reqs.Count > 0, "request captured");
                var lastReq = reqs.Last();
                Require(lastReq.UserId == actorId.ToString("D"), "actor UserId matches JWT claim");
                Require(lastReq.UserName == "file_failed_action_actor", "actor UserName matches JWT claim");
                Require(lastReq.ServiceName == "FileService", "ServiceName is FileService");
                Require(!lastReq.IsSuccess, "audit record marks failed action");
            }
            finally
            {
                await responder.DrainAsync(TimeSpan.FromSeconds(2));
                await fileApp.StopAsync();
                await fileApp.DisposeAsync();
                if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
            }
        }
    }

    private static Task CheckAssemblyTargetAndRuntimeAsync()
    {
        Require(typeof(FileServiceHost).Assembly
            .GetCustomAttribute<TargetFrameworkAttribute>()?.FrameworkName
            == ".NETCoreApp,Version=v10.0", "production File assembly targets10");
        Require(Environment.Version.Major == 10, "harness runtime10");
        return Task.CompletedTask;
    }

    private static async Task CheckSwaggerMultipartSchemaAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-swagger-{Guid.NewGuid():N}");
        var storageDir = Path.Combine(fixtureDir, "storage");
        Directory.CreateDirectory(storageDir);

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--contentRoot", fixtureDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Development"
        });
        await fileApp.StartAsync();
        var baseUrl = fileApp.Urls.First();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
            using var resp = await client.GetAsync("/swagger/v1/swagger.json");
            Require(resp.IsSuccessStatusCode, $"GET /swagger/v1/swagger.json must be 200, got {resp.StatusCode}");
            var json = await resp.Content.ReadAsStringAsync();
            using var swagger = JsonDocument.Parse(json);

            var openApiVer = swagger.RootElement.GetProperty("openapi").GetString();
            Require(openApiVer != null && openApiVer.StartsWith("3.0."), $"OpenAPI3.0 retained, found '{openApiVer}'");

            var paths = swagger.RootElement.GetProperty("paths");
            Require(paths.TryGetProperty("/api/UploadFile", out var uploadFileRoute), "/api/UploadFile path exists in swagger");
            Require(uploadFileRoute.TryGetProperty("post", out var postMethod), "POST method exists on /api/UploadFile");

            Require(postMethod.TryGetProperty("requestBody", out var requestBody), "POST /api/UploadFile has requestBody");
            var content = requestBody.GetProperty("content");
            Require(content.TryGetProperty("multipart/form-data", out var multipart), "POST /api/UploadFile accepts multipart/form-data");
            var schema = multipart.GetProperty("schema");
            var properties = schema.GetProperty("properties");

            Require(properties.TryGetProperty("files", out var filesProp), "schema has 'files' property");
            Require(filesProp.GetProperty("type").GetString() == "array", "'files' is array");
            Require(properties.TryGetProperty("FolderName", out var folderProp), "schema has 'FolderName' property");

            Require(!properties.TryGetProperty("watermark", out _), "no watermark schema on upload");
            Require(!properties.TryGetProperty("convert", out _), "no conversion schema on upload");
            Require(!properties.TryGetProperty("conversion", out _), "no conversion schema on upload");
        }
        finally
        {
            await fileApp.StopAsync();
            await fileApp.DisposeAsync();
            if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
        }
    }

    private static async Task CheckLimitsAndDescriptorUnchangedAsync()
    {
        var postMethod = typeof(UploadFileController).GetMethod("Post");
        Require(postMethod != null, "UploadFileController.Post exists");
        var sizeLimit = postMethod!.GetCustomAttribute<RequestSizeLimitAttribute>();
        var limitBytes = (sizeLimit as Microsoft.AspNetCore.Http.Metadata.IRequestSizeLimitMetadata)?.MaxRequestBodySize;
        Require(sizeLimit != null && limitBytes == 52428800L, $"RequestSizeLimit must be 52428800, got {limitBytes}");
        var formLimits = postMethod.GetCustomAttribute<RequestFormLimitsAttribute>();
        Require(formLimits != null && formLimits.MultipartBodyLengthLimit == 52428800L, $"MultipartBodyLengthLimit must be 52428800, got {formLimits?.MultipartBodyLengthLimit}");

        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-limits-{Guid.NewGuid():N}");
        var storageDir = Path.Combine(fixtureDir, "storage");
        Directory.CreateDirectory(storageDir);

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--contentRoot", fixtureDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });

        try
        {
            var grpcOptions = fileApp.Services.GetRequiredService<IOptions<GrpcServiceOptions>>().Value;
            Require(grpcOptions.MaxReceiveMessageSize == 134217728, $"gRPC MaxReceiveMessageSize must be 134217728, got {grpcOptions.MaxReceiveMessageSize}");
            Require(grpcOptions.MaxSendMessageSize == 134217728, $"gRPC MaxSendMessageSize must be 134217728, got {grpcOptions.MaxSendMessageSize}");
        }
        finally
        {
            await fileApp.DisposeAsync();
            if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
        }

        var fileDesc = FileReflection.Descriptor;
        Require(fileDesc != null, "FileReflection.Descriptor exists");

        var fileProtoService = fileDesc.Services.FirstOrDefault(s => s.Name == "FileProto");
        Require(fileProtoService != null, "FileProto service exists");
        var methodNames = fileProtoService!.Methods.Select(m => m.Name).ToHashSet();
        Require(methodNames.SetEquals(new[] { "UploadData", "DeleteData", "UploadAvatar", "PreviewFile" }), "FileProto methods intact");

        var uploadDataReq = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "UploadDataRequest");
        Require(uploadDataReq != null, "UploadDataRequest exists");
        Require(uploadDataReq!.FindFieldByNumber(UploadDataRequest.RelatedIdFieldNumber) != null, "related_id is field 1");
        Require(uploadDataReq.FindFieldByNumber(UploadDataRequest.ServicePathFieldNumber) != null, "service_path is field 2");
        Require(uploadDataReq.FindFieldByNumber(UploadDataRequest.FolderNameFieldNumber) != null, "folder_name is field 3");
        Require(uploadDataReq.FindFieldByNumber(UploadDataRequest.TempFolderFieldNumber) != null, "temp_folder is field 4");

        var modelAttachment = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "ModelAttachmentProto");
        Require(modelAttachment != null, "ModelAttachmentProto exists");
        Require(modelAttachment!.FindFieldByNumber(ModelAttachmentProto.IdFieldNumber) != null, "id is field 1");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.ReferenceTypeFieldNumber) != null, "reference_type is field 2");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.RelatedIdFieldNumber) != null, "related_id is field 3");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.FileNameFieldNumber) != null, "file_name is field 4");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.FileExtensionFieldNumber) != null, "file_extension is field 5");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.FileSizeFieldNumber) != null, "file_size is field 6");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.FileUrlFieldNumber) != null, "file_url is field 7");
        Require(modelAttachment.FindFieldByNumber(ModelAttachmentProto.FullFileNameFieldNumber) != null, "full_file_name is field 8");

        var deleteDataReq = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "DeleteDataRequest");
        Require(deleteDataReq != null && deleteDataReq.FindFieldByNumber(DeleteDataRequest.FilePathsFieldNumber) != null, "DeleteDataRequest field 1");

        var deleteDataResp = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "DeleteDataResponse");
        Require(deleteDataResp != null && deleteDataResp.FindFieldByNumber(DeleteDataResponse.SuccessFieldNumber) != null, "DeleteDataResponse field 1");

        var uploadAvatarReq = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "UploadAvatarRequest");
        Require(uploadAvatarReq != null && uploadAvatarReq.FindFieldByNumber(UploadAvatarRequest.FolderUploadIdFieldNumber) != null, "UploadAvatarRequest field 1");
        Require(uploadAvatarReq.FindFieldByNumber(UploadAvatarRequest.OldImageFieldNumber) != null, "UploadAvatarRequest field 2");

        var uploadAvatarResp = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "UploadAvatarResponse");
        Require(uploadAvatarResp != null && uploadAvatarResp.FindFieldByNumber(UploadAvatarResponse.NewImageFieldNumber) != null, "UploadAvatarResponse field 1");

        var previewReq = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "PreviewFileRequest");
        Require(previewReq != null && previewReq.FindFieldByNumber(PreviewFileRequest.FileUrlFieldNumber) != null, "PreviewFileRequest field 1");
        Require(previewReq.FindFieldByNumber(PreviewFileRequest.FileIdFieldNumber) != null, "PreviewFileRequest field 6");

        var previewResp = fileDesc.MessageTypes.FirstOrDefault(m => m.Name == "PreviewFileResponse");
        Require(previewResp != null && previewResp.FindFieldByNumber(PreviewFileResponse.FileContentFieldNumber) != null, "PreviewFileResponse field 1");
        Require(previewResp.FindFieldByNumber(PreviewFileResponse.ContentTypeFieldNumber) != null, "PreviewFileResponse field 2");
    }

    private static async Task CheckGrpcWebAuthHeaderAndVersionAsync()
    {
        var tempRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        await using var responder = await EphemeralAuditResponder.StartAsync();

        var fixtureDir = Path.Combine(tempRoot, $"blocks-fs-upgrade-grpcweb-{Guid.NewGuid():N}");
        var storageDir = Path.Combine(fixtureDir, "storage");
        Directory.CreateDirectory(storageDir);

        var actorId = Guid.NewGuid();
        var jwt = CreateJwt(actorId, "grpc_web_test_actor");

        var fileApp = FileServiceHost.Build(new[]
        {
            "--urls", "http://127.0.0.1:0",
            "--GrpcClients:SystemService", responder.Url,
            "--contentRoot", fixtureDir,
            "--FileStorage:RootPath", storageDir,
            "--Jwt:Issuer", JwtIssuer,
            "--Jwt:Audience", JwtAudience,
            "--Jwt:Key", JwtSecret,
            "--Environment", "Production"
        });
        await fileApp.StartAsync();
        var baseUrl = fileApp.Urls.First();

        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(baseUrl) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var folderGuid = Guid.NewGuid();
            using var multipart = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            multipart.Add(fileContent, "files", "grpcweb_test.txt");
            multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

            using var resp = await client.PostAsync("/api/UploadFile", multipart);
            Require(resp.IsSuccessStatusCode, "upload HTTP 200");

            var delivered = await responder.WaitForCallAsync(TimeSpan.FromSeconds(10));
            Require(delivered, "audit delivered via gRPC-Web");

            Require(responder.Protocols.Count > 0, "at least one protocol captured");
            Require(responder.Protocols.Last() == "HTTP/1.1", $"expected HTTP/1.1 gRPC-Web client transport, got {responder.Protocols.Last()}");
        }
        finally
        {
            await responder.DrainAsync(TimeSpan.FromSeconds(2));
            await fileApp.StopAsync();
            await fileApp.DisposeAsync();
            if (Directory.Exists(fixtureDir)) Directory.Delete(fixtureDir, true);
        }
    }

    private sealed class TestLogSink : ILoggerProvider, ILogger
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> _messages = new();

        public bool HasMessage(string fragment) =>
            _messages.Any(m => m.Contains(fragment, StringComparison.OrdinalIgnoreCase));

        public ILogger CreateLogger(string categoryName) => this;
        public void Dispose() { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var msg = formatter(state, exception);
            if (exception != null) msg += " " + exception.Message;
            _messages.Enqueue(msg);
        }
    }
}
