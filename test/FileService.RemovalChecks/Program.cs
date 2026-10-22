using Blocks.FileService;
using Blocks.FileService.Configs;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.FileService.Services.Grpc;
using Blocks.ApiGateway;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Grpc.Core;
using Grpc.Net.Client;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

var mode = args.Length > 0 ? args[0].TrimStart('-').ToLowerInvariant() : "all";
var temporaryRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
var failures = 0;

if (mode is "removal" or "all")
{
    await RunRemovalChecksAsync();
}

if (mode is "paths" or "all")
{
    await RunPathsChecksAsync();
}

if (mode is "sessions" or "all")
{
    await RunSessionsChecksAsync();
}

if (mode is "lifecycle" or "all")
{
    await RunLifecycleChecksAsync();
}

if (mode is "transport" or "all")
{
    await RunTransportChecksAsync();
}

if (mode is "gateway" or "all")
{
    await RunGatewayChecksAsync();
}

Console.WriteLine($"FileService checks: {failures} failure(s).");
return failures == 0 ? 0 : 1;

async Task RunRemovalChecksAsync()
{
    var root = Path.Combine(temporaryRoot, $"blocks-fileservice-check-{Guid.NewGuid():N}");
    var webRoot = Path.Combine(root, "wwwroot");
    var privateRoot = Path.Combine(root, "storage");
    Directory.CreateDirectory(webRoot);
    Directory.CreateDirectory(privateRoot);

    try
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production",
            ContentRootPath = root,
            WebRootPath = webRoot
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
            ["FileStorage:RootPath"] = privateRoot
        });
        builder.ExecuteConfigService();
        await using var app = builder.Build();
        using var scope = app.Services.CreateScope();

        var httpContextAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var actorId = Guid.NewGuid();
        httpContextAccessor.HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D"))
            }, "TestAuth"))
        };

        var service = scope.ServiceProvider.GetRequiredService<IUploadFileService>();
        var grpc = new FileGrpcService(service);
        var bytes = new byte[] { 0, 1, 2, 127, 128, 255 };

        var relatedId = Guid.NewGuid();
        var originalFileId = Guid.NewGuid();
        var originalFileName = $"{originalFileId:D}.txt";
        var originalFileUrl = $"System/Attachments/{relatedId:D}/{originalFileName}";
        var originalPath = Path.Combine(privateRoot, "Files", "System", "Attachments", relatedId.ToString("D"), originalFileName);
        Directory.CreateDirectory(Path.GetDirectoryName(originalPath)!);
        await File.WriteAllBytesAsync(originalPath, bytes);

        await CheckAsync("legacy_watermark_is_rejected_without_returning_original", async () =>
        {
            try
            {
                await grpc.PreviewFile(new PreviewFileRequest
                {
                    FileUrl = originalFileUrl,
                    WatermarkText = "legacy watermark"
                }, null!);
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.Unimplemented)
            {
                return;
            }

            throw new InvalidOperationException("Watermark request returned original content instead of Unimplemented.");
        });

        foreach (var (extension, contentType) in new[]
        {
            (".txt", "text/plain"),
            (".pdf", "application/pdf"),
            (".png", "image/png"),
            (".doc", "application/msword"),
            (".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            (".xls", "application/vnd.ms-excel"),
            (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            (".unknown", "application/octet-stream")
        })
        {
            await CheckAsync($"original_{extension[1..]}_is_returned_without_conversion_or_file_id", async () =>
            {
                var fileGuid = Guid.NewGuid();
                var name = $"{fileGuid:D}{extension}";
                var fileUrl = $"System/Attachments/{relatedId:D}/{name}";
                var destPath = Path.Combine(privateRoot, "Files", "System", "Attachments", relatedId.ToString("D"), name);
                await File.WriteAllBytesAsync(destPath, bytes);

                var result = await grpc.PreviewFile(new PreviewFileRequest { FileUrl = fileUrl }, null!);
                Require(result.FileContent.ToByteArray().SequenceEqual(bytes), "Original bytes changed.");
                Require(result.FileName == name, "Original file name changed.");
                Require(result.ContentType == contentType, "Original content type changed.");
                Require(result.OriginalContentType == contentType, "Original content type metadata changed.");
                Require(!result.HasWatermark && result.ConvertedContentType == "", "Processing metadata was returned.");
            });
        }

        await CheckAsync("empty_or_missing_original_is_rejected", async () =>
        {
            foreach (var path in new[] { "", "missing.txt", $"System/Attachments/{relatedId:D}/{Guid.NewGuid():D}.txt" })
            {
                try
                {
                    await service.PreviewFileAsync(path);
                }
                catch (BusinessException)
                {
                    continue;
                }

                throw new InvalidOperationException("Invalid original file was accepted.");
            }
        });

        await CheckAsync("upload_finalize_delete_and_avatar_still_work", async () =>
        {
            var folderId = Guid.NewGuid().ToString("D");
            using var uploadStream = new MemoryStream(bytes);
            var upload = new FormFile(uploadStream, 0, bytes.Length, "files", "attachment.txt");
            await service.Insert(new List<IFormFile> { upload }, folderId);
            var attachments = await service.UploadDataAsync(relatedId.ToString("D"), "System", "Attachments", folderId);
            Require(attachments.Count == 1, "Finalized attachment was not returned.");
            var original = await service.PreviewFileAsync(attachments[0].FileUrl);
            Require(original.FileContent.SequenceEqual(bytes), "Finalized attachment bytes changed.");
            Require(await service.DeleteDataAsync(new[] { attachments[0].FileUrl }), "Attachment deletion failed.");
            Require(!File.Exists(Path.Combine(privateRoot, "Files", attachments[0].FileUrl)), "Deleted attachment remains at its old path.");

            var avatarFolderId = Guid.NewGuid().ToString("D");
            var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };
            using var avatarStream = new MemoryStream(pngBytes);
            var avatar = new FormFile(avatarStream, 0, pngBytes.Length, "files", "avatar.png");
            await service.Insert(new List<IFormFile> { avatar }, avatarFolderId);
            var avatarPath = await service.UploadAvatarAsync(avatarFolderId);
            Require(avatarPath.StartsWith("System/Avatar/", StringComparison.Ordinal), "Avatar path changed.");
            var avatarFileName = Path.GetFileName(avatarPath);
            var storedAvatarPath = Path.Combine(privateRoot, "Avatars", avatarFileName);
            Require(File.Exists(storedAvatarPath), "Stored avatar does not exist.");
            Require((await File.ReadAllBytesAsync(storedAvatarPath)).SequenceEqual(pngBytes), "Avatar bytes changed.");
        });
    }
    finally
    {
        Require(Path.GetDirectoryName(Path.GetFullPath(root)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(root, recursive: true);
    }
}

async Task RunPathsChecksAsync()
{
    var fixtureDir = Path.Combine(temporaryRoot, $"blocks-paths-check-{Guid.NewGuid():N}");
    var webRoot = Path.Combine(fixtureDir, "www");
    var siblingRoot = Path.Combine(fixtureDir, "www-sibling");
    var privateRoot = Path.Combine(fixtureDir, "storage");

    Directory.CreateDirectory(webRoot);
    Directory.CreateDirectory(siblingRoot);
    Directory.CreateDirectory(privateRoot);

    var sentinel = Path.Combine(siblingRoot, "sentinel.txt");
    var before = new byte[] { 42, 43, 44 };
    await File.WriteAllBytesAsync(sentinel, before);

    try
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production",
            ContentRootPath = fixtureDir,
            WebRootPath = webRoot
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
            ["FileStorage:RootPath"] = privateRoot
        });
        builder.ExecuteConfigService();
        await using var app = builder.Build();
        using var scope = app.Services.CreateScope();

        var httpContextAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var actorId = Guid.NewGuid();
        httpContextAccessor.HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D"))
            }, "TestAuth"))
        };

        var service = scope.ServiceProvider.GetRequiredService<IUploadFileService>();

        await CheckAsync("filename_traversal_does_not_escape", async () =>
        {
            var folderId = Guid.NewGuid().ToString("D");
            var payload = new byte[] { 1, 2, 3 };
            using var ms = new MemoryStream(payload);
            var upload = new FormFile(ms, 0, payload.Length, "files", "../escaped.txt");

            bool rejected = false;
            try
            {
                await service.Insert(new List<IFormFile> { upload }, folderId);
            }
            catch (BusinessException)
            {
                rejected = true;
            }

            Require(rejected, "filename traversal must be rejected");

            var escapedFile = Path.Combine(webRoot, "Files", "Temp", "escaped.txt");
            var escapedPrivate = Path.Combine(privateRoot, "Temp", "escaped.txt");
            Require(!File.Exists(escapedFile), "no path escape in web root");
            Require(!File.Exists(escapedPrivate), "no path escape in private root");
            Require(!File.Exists(Path.Combine(webRoot, "Files", "Temp", folderId)), "no user data in web root");
        });

        await CheckAsync("sibling_root_is_rejected", async () =>
        {
            var siblingRelative = "../www-sibling/sentinel.txt";
            bool rejected = false;
            try
            {
                await service.PreviewFileAsync(siblingRelative);
            }
            catch (BusinessException)
            {
                rejected = true;
            }

            Require(rejected, "sibling root traversal must be rejected");
            Require(File.ReadAllBytes(sentinel).SequenceEqual(before), "outside file unchanged");
        });

        await CheckAsync("absolute_unc_ads_are_rejected", async () =>
        {
            var badPaths = new[]
            {
                @"C:\outside.txt",
                @"C:relative.txt",
                @"\\host\share\file.txt",
                @"../x.txt",
                @"..\x.txt",
                "name.txt:stream",
                "file:///etc/passwd",
                ""
            };

            foreach (var bad in badPaths)
            {
                bool rejected = false;
                try
                {
                    await service.PreviewFileAsync(bad);
                }
                catch (BusinessException)
                {
                    rejected = true;
                }
                Require(rejected, $"Bad path '{bad}' must be rejected.");
            }
            Require(File.ReadAllBytes(sentinel).SequenceEqual(before), "outside file unchanged");
        });

        await CheckAsync("unregistered_target_is_rejected", async () =>
        {
            var folderId = Guid.NewGuid().ToString("D");
            bool rejected = false;
            try
            {
                await service.UploadDataAsync(Guid.NewGuid().ToString("D"), "UnregisteredService", "UnregisteredModule", folderId);
            }
            catch (BusinessException)
            {
                rejected = true;
            }

            Require(rejected, "unregistered service/module target must be rejected");
        });

        // Root guards: startup validation
        await CheckAsync("missing_or_relative_or_overlapping_root_fails_startup", async () =>
        {
            // Missing root
            var b1 = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = "Production",
                ContentRootPath = fixtureDir,
                WebRootPath = webRoot
            });
            b1.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrpcClients:SystemService"] = "http://127.0.0.1:1"
            });
            b1.ExecuteConfigService();
            bool caughtMissing = false;
            try
            {
                await using var a1 = b1.Build();
                a1.Services.GetRequiredService<FileStorage>();
            }
            catch (Exception)
            {
                caughtMissing = true;
            }
            Require(caughtMissing, "Missing RootPath must fail startup.");

            // Relative root
            var b2 = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = "Production",
                ContentRootPath = fixtureDir,
                WebRootPath = webRoot
            });
            b2.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
                ["FileStorage:RootPath"] = "relative/path"
            });
            b2.ExecuteConfigService();
            bool caughtRelative = false;
            try
            {
                await using var a2 = b2.Build();
                a2.Services.GetRequiredService<FileStorage>();
            }
            catch (Exception)
            {
                caughtRelative = true;
            }
            Require(caughtRelative, "Relative RootPath must fail startup.");

            // Root overlapping webRoot
            var b3 = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = "Production",
                ContentRootPath = fixtureDir,
                WebRootPath = webRoot
            });
            b3.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
                ["FileStorage:RootPath"] = webRoot
            });
            b3.ExecuteConfigService();
            bool caughtOverlap = false;
            try
            {
                await using var a3 = b3.Build();
                a3.Services.GetRequiredService<FileStorage>();
            }
            catch (Exception)
            {
                caughtOverlap = true;
            }
            Require(caughtOverlap, "RootPath matching webRoot must fail startup.");
        });

        await CheckAsync("symlink_root_is_rejected_or_not_run", async () =>
        {
            var symlinkTarget = Path.Combine(fixtureDir, "symlink-target");
            var symlinkDir = Path.Combine(fixtureDir, "symlink-link");
            Directory.CreateDirectory(symlinkTarget);

            bool symlinkCreated = false;
            try
            {
                Directory.CreateSymbolicLink(symlinkDir, symlinkTarget);
                symlinkCreated = Directory.Exists(symlinkDir);
            }
            catch
            {
                symlinkCreated = false;
            }

            if (!symlinkCreated)
            {
                Console.WriteLine("INFO: symlink_root_is_rejected_or_not_run - OS privilege absent, marked NOT RUN.");
                return;
            }

            var bSym = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = "Production",
                ContentRootPath = fixtureDir,
                WebRootPath = webRoot
            });
            bSym.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
                ["FileStorage:RootPath"] = symlinkDir
            });
            bSym.ExecuteConfigService();

            bool caughtSymlink = false;
            try
            {
                await using var aSym = bSym.Build();
                aSym.Services.GetRequiredService<FileStorage>();
            }
            catch (Exception)
            {
                caughtSymlink = true;
            }

            Require(caughtSymlink, "RootPath going through symlink must be rejected.");
        });
    }
    finally
    {
        Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(fixtureDir, recursive: true);
    }
}

async Task RunSessionsChecksAsync()
{
    var fixtureDir = Path.Combine(temporaryRoot, $"blocks-sessions-check-{Guid.NewGuid():N}");
    var webRoot = Path.Combine(fixtureDir, "www");
    var privateRoot = Path.Combine(fixtureDir, "storage");

    Directory.CreateDirectory(webRoot);
    Directory.CreateDirectory(privateRoot);

    try
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production",
            ContentRootPath = fixtureDir,
            WebRootPath = webRoot
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
            ["FileStorage:RootPath"] = privateRoot
        });
        builder.ExecuteConfigService();
        await using var app = builder.Build();
        using var scope = app.Services.CreateScope();

        var httpContextAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var actorA = Guid.NewGuid();
        var actorB = Guid.NewGuid();

        void SetActor(Guid id)
        {
            httpContextAccessor.HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("name", id.ToString("D"))
                }, "TestAuth"))
            };
        }

        var service = scope.ServiceProvider.GetRequiredService<IUploadFileService>();
        var storage = scope.ServiceProvider.GetRequiredService<FileStorage>();

        await CheckAsync("invalid_second_file_preserves_previous_batch", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderIdStr = folderId.ToString("D");

            var payload1 = new byte[] { 10, 20, 30 };
            using var ms1 = new MemoryStream(payload1);
            var file1 = new FormFile(ms1, 0, payload1.Length, "files", "first.txt");
            await service.Insert(new List<IFormFile> { file1 }, folderIdStr);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var manifestPath = Path.Combine(sessionDir, "manifest.json");
            Require(File.Exists(manifestPath), "manifest exists after successful batch");
            var previousManifest = await File.ReadAllBytesAsync(manifestPath);

            var batchesDir = Path.Combine(sessionDir, "batches");
            var batchDirs = Directory.GetDirectories(batchesDir);
            Require(batchDirs.Length == 1, "exactly one batch folder exists");
            var previousFiles = Directory.GetFiles(batchDirs[0]);
            Require(previousFiles.Length == 1, "one file in previous batch");
            var previousBytes = await File.ReadAllBytesAsync(previousFiles[0]);

            // Attempt batch 2 with invalid second file
            using var ms2a = new MemoryStream(new byte[] { 40, 50 });
            using var ms2b = new MemoryStream(new byte[] { 60, 70 });
            var f2a = new FormFile(ms2a, 0, 2, "files", "second.txt");
            var f2b = new FormFile(ms2b, 0, 2, "files", "bad:name.txt");

            bool rejected = false;
            try
            {
                await service.Insert(new List<IFormFile> { f2a, f2b }, folderIdStr);
            }
            catch (BusinessException)
            {
                rejected = true;
            }

            Require(rejected, "invalid second file must reject whole batch");
            Require(File.ReadAllBytes(manifestPath).SequenceEqual(previousManifest), "manifest unchanged on failure");
            Require(File.ReadAllBytes(previousFiles[0]).SequenceEqual(previousBytes), "previous batch retained");
        });

        await CheckAsync("copy_failure_preserves_manifest", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderIdStr = folderId.ToString("D");

            var payload1 = new byte[] { 1, 2, 3, 4 };
            using var ms1 = new MemoryStream(payload1);
            var file1 = new FormFile(ms1, 0, payload1.Length, "files", "good.txt");
            await service.Insert(new List<IFormFile> { file1 }, folderIdStr);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var manifestPath = Path.Combine(sessionDir, "manifest.json");
            var previousManifest = await File.ReadAllBytesAsync(manifestPath);
            var batchesDir = Path.Combine(sessionDir, "batches");
            var previousBatchDir = Directory.GetDirectories(batchesDir)[0];
            var previousFile = Directory.GetFiles(previousBatchDir)[0];
            var previousBytes = await File.ReadAllBytesAsync(previousFile);

            // Attempt batch 2 with stream that throws IOException mid-copy
            var failData = new byte[] { 9, 8, 7, 6, 5 };
            using var faultyStream = new FaultyStream(failData, 2, new IOException("Disk full simulation"));
            var faultyFile = new FormFile(faultyStream, 0, failData.Length, "files", "faulty.txt");

            bool threw = false;
            try
            {
                await service.Insert(new List<IFormFile> { faultyFile }, folderIdStr);
            }
            catch (IOException)
            {
                threw = true;
                Console.WriteLine("INFO: disk-full simulated via stream error; filesystem quota not tested.");
            }

            Require(threw, "faulty stream must throw IOException");
            Require(File.ReadAllBytes(manifestPath).SequenceEqual(previousManifest), "manifest unchanged on failure");
            Require(File.ReadAllBytes(previousFile).SequenceEqual(previousBytes), "previous batch retained");
        });

        await CheckAsync("cancel_preserves_manifest", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderIdStr = folderId.ToString("D");

            var payload1 = new byte[] { 5, 5, 5 };
            using var ms1 = new MemoryStream(payload1);
            var file1 = new FormFile(ms1, 0, payload1.Length, "files", "cancel_prev.txt");
            await service.Insert(new List<IFormFile> { file1 }, folderIdStr);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var manifestPath = Path.Combine(sessionDir, "manifest.json");
            var previousManifest = await File.ReadAllBytesAsync(manifestPath);
            var batchesDir = Path.Combine(sessionDir, "batches");
            var previousFile = Directory.GetFiles(Directory.GetDirectories(batchesDir)[0])[0];
            var previousBytes = await File.ReadAllBytesAsync(previousFile);

            var cancelData = new byte[] { 7, 7, 7, 7 };
            using var cancelStream = new FaultyStream(cancelData, 1, new OperationCanceledException("Upload cancelled"));
            var cancelFile = new FormFile(cancelStream, 0, cancelData.Length, "files", "cancelled.txt");

            bool threw = false;
            try
            {
                await service.Insert(new List<IFormFile> { cancelFile }, folderIdStr);
            }
            catch (OperationCanceledException)
            {
                threw = true;
            }

            Require(threw, "cancelled upload must throw OperationCanceledException");
            Require(File.ReadAllBytes(manifestPath).SequenceEqual(previousManifest), "manifest unchanged on failure");
            Require(File.ReadAllBytes(previousFile).SequenceEqual(previousBytes), "previous batch retained");
        });

        await CheckAsync("same_folder_other_actor_is_isolated", async () =>
        {
            var sharedFolderId = Guid.NewGuid();
            var folderStr = sharedFolderId.ToString("D");

            SetActor(actorA);
            var payloadA = new byte[] { 0xAA, 0xAA };
            using var msA = new MemoryStream(payloadA);
            await service.Insert(new List<IFormFile> { new FormFile(msA, 0, 2, "files", "fileA.txt") }, folderStr);

            SetActor(actorB);
            var payloadB = new byte[] { 0xBB, 0xBB };
            using var msB = new MemoryStream(payloadB);
            await service.Insert(new List<IFormFile> { new FormFile(msB, 0, 2, "files", "fileB.txt") }, folderStr);

            var sessionA = storage.ResolveSession(actorA, sharedFolderId);
            var sessionB = storage.ResolveSession(actorB, sharedFolderId);

            Require(sessionA != sessionB, "sessions for different actors must have different paths");
            Require(File.Exists(Path.Combine(sessionA, "manifest.json")), "actor A manifest exists");
            Require(File.Exists(Path.Combine(sessionB, "manifest.json")), "actor B manifest exists");

            var fileAInBatch = Directory.GetFiles(Directory.GetDirectories(Path.Combine(sessionA, "batches"))[0])[0];
            var fileBInBatch = Directory.GetFiles(Directory.GetDirectories(Path.Combine(sessionB, "batches"))[0])[0];

            Require(File.ReadAllBytes(fileAInBatch).SequenceEqual(payloadA), "actor A payload unchanged");
            Require(File.ReadAllBytes(fileBInBatch).SequenceEqual(payloadB), "actor B payload unchanged");
        });

        await CheckAsync("concurrent_replace_is_not_mixed", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");

            var batchA1 = new byte[] { 1, 1, 1 };
            var batchA2 = new byte[] { 2, 2, 2 };
            var hashA1 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(batchA1));
            var hashA2 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(batchA2));
            var batchAHashes = new[] { hashA1, hashA2 };

            var batchB1 = new byte[] { 3, 3, 3 };
            var batchB2 = new byte[] { 4, 4, 4 };
            var hashB1 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(batchB1));
            var hashB2 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(batchB2));
            var batchBHashes = new[] { hashB1, hashB2 };

            var taskA = Task.Run(async () =>
            {
                SetActor(actorA);
                using var msA1 = new MemoryStream(batchA1);
                using var msA2 = new MemoryStream(batchA2);
                var fA1 = new FormFile(msA1, 0, batchA1.Length, "files", "a1.txt");
                var fA2 = new FormFile(msA2, 0, batchA2.Length, "files", "a2.txt");
                await service.Insert(new List<IFormFile> { fA1, fA2 }, folderStr);
            });

            var taskB = Task.Run(async () =>
            {
                SetActor(actorA);
                using var msB1 = new MemoryStream(batchB1);
                using var msB2 = new MemoryStream(batchB2);
                var fB1 = new FormFile(msB1, 0, batchB1.Length, "files", "b1.txt");
                var fB2 = new FormFile(msB2, 0, batchB2.Length, "files", "b2.txt");
                await service.Insert(new List<IFormFile> { fB1, fB2 }, folderStr);
            });

            await Task.WhenAll(taskA, taskB);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var manifestJson = await File.ReadAllTextAsync(Path.Combine(sessionDir, "manifest.json"));
            using var doc = System.Text.Json.JsonDocument.Parse(manifestJson);
            var batchId = doc.RootElement.GetProperty("BatchId").GetString()!;

            var currentBatchFiles = Directory.GetFiles(Path.Combine(sessionDir, "batches", batchId));
            var currentBatchHashes = currentBatchFiles
                .Select(f => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(f))))
                .ToArray();

            Require(currentBatchHashes.Order().SequenceEqual(batchAHashes.Order()) ||
                    currentBatchHashes.Order().SequenceEqual(batchBHashes.Order()), "no mixed batch");
        });

        await CheckAsync("unpublished_batch_is_ignored_after_restart", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");

            var payload = new byte[] { 100, 101 };
            using var ms = new MemoryStream(payload);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, payload.Length, "files", "published.txt") }, folderStr);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var orphanBatch = Path.Combine(sessionDir, "batches", Guid.NewGuid().ToString("D"));
            Directory.CreateDirectory(orphanBatch);
            await File.WriteAllBytesAsync(Path.Combine(orphanBatch, "orphan.txt"), new byte[] { 99, 99 });

            // Read session using UploadSessionStore
            var sessionStore = scope.ServiceProvider.GetRequiredService<UploadSessionStore>();
            var session = await sessionStore.ReadAsync(actorA, folderId, CancellationToken.None);
            Require(session != null, "published session must be readable");
            Require(session!.Files.Count == 1, "only files in published batch are read");
            Require(session.Files[0].OriginalName == "published.txt", "published file name matches");
        });

        await CheckAsync("corrupt_manifest_fails_closed", async () =>
        {
            SetActor(actorA);
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");

            var payload = new byte[] { 111, 222 };
            using var ms = new MemoryStream(payload);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, payload.Length, "files", "corrupt_test.txt") }, folderStr);

            var sessionDir = storage.ResolveSession(actorA, folderId);
            var manifestPath = Path.Combine(sessionDir, "manifest.json");
            await File.WriteAllTextAsync(manifestPath, "{ corrupted json !!!");

            var sessionStore = scope.ServiceProvider.GetRequiredService<UploadSessionStore>();
            bool threw = false;
            try
            {
                await sessionStore.ReadAsync(actorA, folderId, CancellationToken.None);
            }
            catch (BusinessException ex) when (ex.StatusCode == 409)
            {
                threw = true;
            }

            Require(threw, "corrupt manifest must fail closed with 409 Conflict");
        });
    }
    finally
    {
        Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(fixtureDir, recursive: true);
    }
}

async Task RunLifecycleChecksAsync()
{
    var fixtureDir = Path.Combine(temporaryRoot, $"blocks-lifecycle-check-{Guid.NewGuid():N}");
    var webRoot = Path.Combine(fixtureDir, "www");
    var privateRoot = Path.Combine(fixtureDir, "storage");

    Directory.CreateDirectory(webRoot);
    Directory.CreateDirectory(privateRoot);

    try
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Production",
            ContentRootPath = fixtureDir,
            WebRootPath = webRoot
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GrpcClients:SystemService"] = "http://127.0.0.1:1",
            ["FileStorage:RootPath"] = privateRoot
        });
        builder.ExecuteConfigService();
        await using var app = builder.Build();
        using var scope = app.Services.CreateScope();

        var httpContextAccessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var actorId = Guid.NewGuid();
        httpContextAccessor.HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim("name", actorId.ToString("D"))
            }, "TestAuth"))
        };

        var service = scope.ServiceProvider.GetRequiredService<IUploadFileService>();
        var storage = scope.ServiceProvider.GetRequiredService<FileStorage>();
        var sessionStore = scope.ServiceProvider.GetRequiredService<UploadSessionStore>();

        await CheckAsync("partial_finalize_preserves_source", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");

            var b1 = new byte[] { 1, 2, 3 };
            var b2 = new byte[] { 4, 5, 6 };
            using var ms1 = new MemoryStream(b1);
            using var ms2 = new MemoryStream(b2);
            await service.Insert(new List<IFormFile>
            {
                new FormFile(ms1, 0, b1.Length, "files", "f1.txt"),
                new FormFile(ms2, 0, b2.Length, "files", "f2.txt")
            }, folderStr);

            var session = await sessionStore.ReadAsync(actorId, folderId, CancellationToken.None);
            var file2Id = session!.Files[1].Id;

            // Create a directory at destination for file2 to trigger copy error
            var relatedId = Guid.NewGuid();
            var conflictDir = storage.Resolve(StorageArea.Files, "System", "Attachments", relatedId.ToString("D"), $"{file2Id:D}.txt");
            Directory.CreateDirectory(conflictDir);

            bool threw = false;
            try
            {
                await service.UploadDataAsync(relatedId.ToString("D"), "System", "Attachments", folderStr);
            }
            catch (Exception)
            {
                threw = true;
            }

            Require(threw, "finalize must throw on destination directory conflict");

            // Source files must be preserved intact!
            var batchDir = Path.Combine(storage.ResolveSession(actorId, folderId), "batches", session.BatchId.ToString("D"));
            var s1 = Path.Combine(batchDir, $"{session.Files[0].Id:D}.txt");
            var s2 = Path.Combine(batchDir, $"{session.Files[1].Id:D}.txt");
            Require(File.Exists(s1) && File.Exists(s2), "source files preserved on partial finalize failure");
            Require(File.ReadAllBytes(s1).SequenceEqual(b1), "source file 1 bytes unchanged");
            Require(File.ReadAllBytes(s2).SequenceEqual(b2), "source file 2 bytes unchanged");
        });

        await CheckAsync("retry_returns_same_keys", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");
            var b = new byte[] { 7, 8, 9 };
            using var ms = new MemoryStream(b);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, b.Length, "files", "item.txt") }, folderStr);

            var relatedId = Guid.NewGuid().ToString("D");
            var first = await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);
            var retry = await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);

            Require(first.Select(f => f.FileUrl).SequenceEqual(retry.Select(f => f.FileUrl)), "stable retry keys");
            Require(first.Select(f => f.Id).SequenceEqual(retry.Select(f => f.Id)), "stable attachment IDs");
        });

        await CheckAsync("different_target_is_rejected", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");
            var b = new byte[] { 10, 11, 12 };
            using var ms = new MemoryStream(b);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, b.Length, "files", "target_test.txt") }, folderStr);

            var relatedId1 = Guid.NewGuid().ToString("D");
            var relatedId2 = Guid.NewGuid().ToString("D");
            await service.UploadDataAsync(relatedId1, "System", "Attachments", folderStr);

            bool rejected = false;
            try
            {
                await service.UploadDataAsync(relatedId2, "System", "Attachments", folderStr);
            }
            catch (BusinessException ex) when (ex.StatusCode == 409)
            {
                rejected = true;
            }

            Require(rejected, "finalized session called with different target must be rejected with 409");
        });

        await CheckAsync("finalized_session_cannot_be_replaced", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");
            var b = new byte[] { 13, 14, 15 };
            using var ms = new MemoryStream(b);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, b.Length, "files", "sealed.txt") }, folderStr);

            var relatedId = Guid.NewGuid().ToString("D");
            await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);

            bool rejected = false;
            try
            {
                using var msNew = new MemoryStream(new byte[] { 16, 17 });
                await service.Insert(new List<IFormFile> { new FormFile(msNew, 0, 2, "files", "new.txt") }, folderStr);
            }
            catch (BusinessException ex) when (ex.StatusCode == 409)
            {
                rejected = true;
            }

            Require(rejected, "inserting into finalized session must be rejected with 409");
        });

        await CheckAsync("deleted_or_missing_receipt_target_is_not_resurrected", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");
            var b = new byte[] { 18, 19, 20 };
            using var ms = new MemoryStream(b);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, b.Length, "files", "ephemeral.txt") }, folderStr);

            var relatedId = Guid.NewGuid().ToString("D");
            var res = await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);
            var destPath = storage.ResolveActiveKey(res[0].FileUrl);
            File.Delete(destPath); // Target missing

            bool rejected = false;
            try
            {
                await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);
            }
            catch (BusinessException ex) when (ex.StatusCode == 409)
            {
                rejected = true;
            }

            Require(rejected, "missing finalized target must fail closed with 409, no resurrection");
        });

        await CheckAsync("delete_retry_is_distinguished_from_unknown_key", async () =>
        {
            var folderId = Guid.NewGuid();
            var folderStr = folderId.ToString("D");
            var b = new byte[] { 21, 22, 23 };
            using var ms = new MemoryStream(b);
            await service.Insert(new List<IFormFile> { new FormFile(ms, 0, b.Length, "files", "to_delete.txt") }, folderStr);

            var relatedId = Guid.NewGuid().ToString("D");
            var res = await service.UploadDataAsync(relatedId, "System", "Attachments", folderStr);
            var fileUrl = res[0].FileUrl;
            var originalPath = storage.ResolveActiveKey(fileUrl);

            Require(await service.DeleteDataAsync(new[] { fileUrl }), "first delete succeeds");
            Require(!File.Exists(originalPath), "original file moved");

            // Delete retry returns true because of receipt
            Require(await service.DeleteDataAsync(new[] { fileUrl }), "delete retry with receipt succeeds");

            // Unknown key without receipt returns false
            var fakeKey = $"System/Attachments/{Guid.NewGuid():D}/{Guid.NewGuid():D}.txt";
            Require(!await service.DeleteDataAsync(new[] { fakeKey }), "unknown key returns false");
        });

        await CheckAsync("avatar_rejects_multiple_or_non_raster_files", async () =>
        {
            // Multiple files
            var multiFolder = Guid.NewGuid();
            using var m1 = new MemoryStream(new byte[] { 1 });
            using var m2 = new MemoryStream(new byte[] { 2 });
            await service.Insert(new List<IFormFile>
            {
                new FormFile(m1, 0, 1, "files", "a.png"),
                new FormFile(m2, 0, 1, "files", "b.png")
            }, multiFolder.ToString("D"));

            bool multiRejected = false;
            try
            {
                await service.UploadAvatarAsync(multiFolder.ToString("D"));
            }
            catch (BusinessException)
            {
                multiRejected = true;
            }
            Require(multiRejected, "multiple avatar files must be rejected");

            // Non-raster: text file disguised as png
            var fakeFolder = Guid.NewGuid();
            var fakePng = Encoding.UTF8.GetBytes("<svg>fake</svg>");
            using var mFake = new MemoryStream(fakePng);
            await service.Insert(new List<IFormFile> { new FormFile(mFake, 0, fakePng.Length, "files", "fake.png") }, fakeFolder.ToString("D"));

            bool fakeRejected = false;
            try
            {
                await service.UploadAvatarAsync(fakeFolder.ToString("D"));
            }
            catch (BusinessException)
            {
                fakeRejected = true;
            }
            Require(fakeRejected, "non-raster content disguised as PNG must be rejected");

            // Valid PNG
            var pngFolder = Guid.NewGuid();
            var validPng = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 1 };
            using var mPng = new MemoryStream(validPng);
            await service.Insert(new List<IFormFile> { new FormFile(mPng, 0, validPng.Length, "files", "valid.png") }, pngFolder.ToString("D"));
            var pngKey = await service.UploadAvatarAsync(pngFolder.ToString("D"));
            Require(pngKey.StartsWith("System/Avatar/"), "valid PNG avatar uploaded");

            // Valid JPEG
            var jpegFolder = Guid.NewGuid();
            var validJpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46 };
            using var mJpeg = new MemoryStream(validJpeg);
            await service.Insert(new List<IFormFile> { new FormFile(mJpeg, 0, validJpeg.Length, "files", "valid.jpg") }, jpegFolder.ToString("D"));
            var jpegKey = await service.UploadAvatarAsync(jpegFolder.ToString("D"));
            Require(jpegKey.StartsWith("System/Avatar/"), "valid JPEG avatar uploaded");

            // Valid WebP
            var webpFolder = Guid.NewGuid();
            var validWebp = Encoding.ASCII.GetBytes("RIFF1234WEBPVP8 ......");
            using var mWebp = new MemoryStream(validWebp);
            await service.Insert(new List<IFormFile> { new FormFile(mWebp, 0, validWebp.Length, "files", "valid.webp") }, webpFolder.ToString("D"));
            var webpKey = await service.UploadAvatarAsync(webpFolder.ToString("D"));
            Require(webpKey.StartsWith("System/Avatar/"), "valid WebP avatar uploaded");
        });

        await CheckAsync("avatar_does_not_delete_old_image", async () =>
        {
            var oldAvatarFileName = $"{Guid.NewGuid():D}.png";
            var oldAvatarPath = storage.ResolveAvatar(oldAvatarFileName);
            var oldBytes = new byte[] { 99, 98, 97 };
            Directory.CreateDirectory(Path.GetDirectoryName(oldAvatarPath)!);
            await File.WriteAllBytesAsync(oldAvatarPath, oldBytes);

            var newFolder = Guid.NewGuid();
            var newPng = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 5, 6, 7 };
            using var mNew = new MemoryStream(newPng);
            await service.Insert(new List<IFormFile> { new FormFile(mNew, 0, newPng.Length, "files", "new.png") }, newFolder.ToString("D"));

            var newAvatarKey = await service.UploadAvatarAsync(newFolder.ToString("D"));
            Require(newAvatarKey.StartsWith("System/Avatar/"), "new avatar created");
            Require(File.Exists(oldAvatarPath), "old avatar untouched by finalize");
            Require(File.ReadAllBytes(oldAvatarPath).SequenceEqual(oldBytes), "old avatar bytes intact");
        });
    }
    finally
    {
        Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(fixtureDir, recursive: true);
    }
}

string CreateTestJwt(Guid actorGuid, string issuer = "TestIssuer", string audience = "TestAudience", string key = "test_jwt_key_super_secret_for_hardening_checks_32_bytes_long!", TimeSpan? lifetime = null)
{
    var tokenHandler = new JwtSecurityTokenHandler();
    var tokenDescriptor = new SecurityTokenDescriptor
    {
        Subject = new ClaimsIdentity(new[]
        {
            new Claim("name", actorGuid.ToString("D")),
            new Claim("unique_name", "testuser")
        }),
        Expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromHours(1)),
        Issuer = issuer,
        Audience = audience,
        SigningCredentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256Signature)
    };
    var token = tokenHandler.CreateToken(tokenDescriptor);
    return tokenHandler.WriteToken(token);
}

async Task RunTransportChecksAsync()
{
    var fixtureDir = Path.Combine(temporaryRoot, $"blocks-transport-check-{Guid.NewGuid():N}");
    var webDir = Path.Combine(fixtureDir, "wwwroot");
    var storageDir = Path.Combine(fixtureDir, "storage");

    Directory.CreateDirectory(webDir);
    Directory.CreateDirectory(storageDir);

    var jwtKey = "test_jwt_key_super_secret_for_hardening_checks_32_bytes_long!";

    // Write sentinels
    await File.WriteAllTextAsync(Path.Combine(webDir, "sentinel.txt"), "web sentinel");
    Directory.CreateDirectory(Path.Combine(storageDir, "Temp"));
    await File.WriteAllTextAsync(Path.Combine(storageDir, "Temp", "sentinel.txt"), "temp sentinel");

    var fileApp = FileServiceHost.Build(new[]
    {
        "--urls", "http://127.0.0.1:0",
        "--FileStorage:RootPath", storageDir,
        "--Jwt:Issuer", "TestIssuer",
        "--Jwt:Audience", "TestAudience",
        "--Jwt:Key", jwtKey,
        "--Environment", "Production"
    });

    await fileApp.StartAsync();
    var fileBaseUrl = fileApp.Urls.First();
    using var httpClient = new HttpClient { BaseAddress = new Uri(fileBaseUrl) };

    try
    {
        await CheckAsync("legacy_static_urls_are_not_served", async () =>
        {
            var resp = await httpClient.GetAsync("/sentinel.txt");
            Require(resp.StatusCode == System.Net.HttpStatusCode.NotFound, "static files must not be served");

            var respTemp = await httpClient.GetAsync("/Temp/sentinel.txt");
            Require(respTemp.StatusCode == System.Net.HttpStatusCode.NotFound, "temp files must not be served via static path");
        });

        await CheckAsync("avatar_requires_jwt", async () =>
        {
            var avatarGuid = Guid.NewGuid();
            var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 11, 22, 33 };
            var avatarsDir = Path.Combine(storageDir, "Avatars");
            Directory.CreateDirectory(avatarsDir);
            await File.WriteAllBytesAsync(Path.Combine(avatarsDir, $"{avatarGuid:D}.png"), pngBytes);

            // Without token: 401 challenge envelope
            var respNoAuth = await httpClient.GetAsync($"/api/Avatar/{avatarGuid:D}.png");
            var jsonNoAuth = await respNoAuth.Content.ReadAsStringAsync();
            var envNoAuth = JsonSerializer.Deserialize<BaseResponse>(jsonNoAuth);
            Require(envNoAuth != null && envNoAuth.StatusCode == 401 && !envNoAuth.Success, "HTTP auth envelope 401");

            // With valid token
            var actor = Guid.NewGuid();
            var token = CreateTestJwt(actor, key: jwtKey);
            using var reqAuth = new HttpRequestMessage(HttpMethod.Get, $"/api/Avatar/{avatarGuid:D}.png");
            reqAuth.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var respAuth = await httpClient.SendAsync(reqAuth);

            Require(respAuth.StatusCode == System.Net.HttpStatusCode.OK, "avatar with token returns 200 OK");
            Require(respAuth.Headers.CacheControl?.NoStore == true, "no-store cache control required");
            Require(respAuth.Headers.Contains("X-Content-Type-Options"), "nosniff header required");
            var contentBytes = await respAuth.Content.ReadAsByteArrayAsync();
            Require(contentBytes.SequenceEqual(pngBytes), "avatar bytes must match");
        });

        await CheckAsync("grpc_owner_is_raw_name_guid", async () =>
        {
            var actorA = Guid.NewGuid();
            var actorB = Guid.NewGuid();
            var folderGuid = Guid.NewGuid();

            var tokenA = CreateTestJwt(actorA, key: jwtKey);
            var tokenB = CreateTestJwt(actorB, key: jwtKey);

            // Upload batch as Actor A via HTTP POST
            using var multipart = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            multipart.Add(fileContent, "files", "item.txt");
            multipart.Add(new StringContent(folderGuid.ToString("D")), "FolderName");

            using var uploadReq = new HttpRequestMessage(HttpMethod.Post, "/api/UploadFile")
            {
                Content = multipart
            };
            uploadReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenA);
            var uploadResp = await httpClient.SendAsync(uploadReq);
            Require(uploadResp.IsSuccessStatusCode, "upload as actor A succeeded");

            // Now call gRPC UploadData as Actor B on the same folderGuid
            var grpcWebHandler = new Grpc.Net.Client.Web.GrpcWebHandler(Grpc.Net.Client.Web.GrpcWebMode.GrpcWeb, new HttpClientHandler())
            {
                HttpVersion = new Version(1, 1)
            };
            var grpcHttpClient = new HttpClient(grpcWebHandler)
            {
                DefaultRequestVersion = new Version(1, 1),
                DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact
            };
            using var channel = GrpcChannel.ForAddress(fileBaseUrl, new GrpcChannelOptions { HttpClient = grpcHttpClient });
            var invoker = channel.CreateCallInvoker();
            var uploadMethod = new Method<UploadDataRequest, UploadDataResponse>(
                MethodType.Unary,
                "file.FileProto",
                "UploadData",
                Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => UploadDataRequest.Parser.ParseFrom(b)),
                Marshallers.Create(r => Google.Protobuf.MessageExtensions.ToByteArray(r), b => UploadDataResponse.Parser.ParseFrom(b))
            );

            var metaB = new Metadata { { "Authorization", $"Bearer {tokenB}" } };
            bool actorBFailed = false;
            try
            {
                await invoker.AsyncUnaryCall(uploadMethod, null, new CallOptions(metaB), new UploadDataRequest
                {
                    RelatedId = Guid.NewGuid().ToString("D"),
                    ServicePath = "System",
                    FolderName = "Attachments",
                    TempFolder = folderGuid.ToString("D")
                }).ResponseAsync;
            }
            catch (RpcException ex) when (ex.StatusCode == StatusCode.NotFound || ex.StatusCode == StatusCode.FailedPrecondition)
            {
                actorBFailed = true;
            }

            Require(actorBFailed, "foreign alias cannot resolve another actor's batch");

            // Actor A can resolve their own batch
            var metaA = new Metadata { { "Authorization", $"Bearer {tokenA}" } };
            var relatedId = Guid.NewGuid().ToString("D");
            var resA = await invoker.AsyncUnaryCall(uploadMethod, null, new CallOptions(metaA), new UploadDataRequest
            {
                RelatedId = relatedId,
                ServicePath = "System",
                FolderName = "Attachments",
                TempFolder = folderGuid.ToString("D")
            }).ResponseAsync;

            Require(resA.Attachments.Count == 1, "actor A can resolve own batch");
        });
    }
    finally
    {
        await fileApp.StopAsync();
        Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(fixtureDir, recursive: true);
    }
}

async Task RunGatewayChecksAsync()
{
    var fixtureDir = Path.Combine(temporaryRoot, $"blocks-gateway-check-{Guid.NewGuid():N}");
    var storageDir = Path.Combine(fixtureDir, "storage");
    Directory.CreateDirectory(storageDir);

    var jwtKey = "test_jwt_key_super_secret_for_hardening_checks_32_bytes_long!";

    // 1. Mock other cluster destination
    var otherBuilder = WebApplication.CreateBuilder(new[] { "--urls", "http://127.0.0.1:0" });
    var otherApp = otherBuilder.Build();
    otherApp.MapGet("/test", () => "other cluster ok");
    await otherApp.StartAsync();
    var otherPort = new Uri(otherApp.Urls.First()).Port;

    // 2. FileService host
    var fileApp = FileServiceHost.Build(new[]
    {
        "--urls", "http://127.0.0.1:0",
        "--FileStorage:RootPath", storageDir,
        "--Jwt:Issuer", "TestIssuer",
        "--Jwt:Audience", "TestAudience",
        "--Jwt:Key", jwtKey,
        "--Environment", "Production"
    });
    await fileApp.StartAsync();
    var filePort = new Uri(fileApp.Urls.First()).Port;

    // 3. Gateway host
    var gwApp = GatewayHost.Build(new[]
    {
        "--urls", "http://127.0.0.1:0",
        "--FileProxy:ClusterId", "fileCluster",
        "--ReverseProxy:Clusters:fileCluster:Destinations:fileDest:Address", $"http://127.0.0.1:{filePort}",
        "--ReverseProxy:Routes:fileRoute:ClusterId", "fileCluster",
        "--ReverseProxy:Routes:fileRoute:Match:Path", "/File/{**catch-all}",
        "--ReverseProxy:Routes:fileRoute:Transforms:0:PathRemovePrefix", "/File",
        "--ReverseProxy:Clusters:otherCluster:Destinations:otherDest:Address", $"http://127.0.0.1:{otherPort}",
        "--ReverseProxy:Routes:otherRoute:ClusterId", "otherCluster",
        "--ReverseProxy:Routes:otherRoute:Match:Path", "/Other/{**catch-all}",
        "--ReverseProxy:Routes:otherRoute:Transforms:0:PathRemovePrefix", "/Other",
        "--Environment", "Production"
    });
    await gwApp.StartAsync();
    var gwBaseUrl = gwApp.Urls.First();
    using var gwClient = new HttpClient { BaseAddress = new Uri(gwBaseUrl) };

    try
    {
        await CheckAsync("other_cluster_still_proxies", async () =>
        {
            var resp = await gwClient.GetAsync("/Other/test");
            Require(resp.IsSuccessStatusCode, "other cluster proxied");
            var text = await resp.Content.ReadAsStringAsync();
            Require(text == "other cluster ok", "other cluster content correct");
        });

        await CheckAsync("file_cluster_alias_is_denied", async () =>
        {
            // Blocked HTTP route to File cluster
            var resp = await gwClient.GetAsync("/File/api/SomeRandomPath");
            var json = await resp.Content.ReadAsStringAsync();
            var env = JsonSerializer.Deserialize<BaseResponse>(json);
            Require(env != null && env.StatusCode == 403 && !env.Success, "blocked gateway request returns 403 envelope");

            // Blocked gRPC attempt to File cluster
            using var grpcReq = new HttpRequestMessage(HttpMethod.Post, "/File/file.FileProto/UploadData");
            grpcReq.Content = new ByteArrayContent(new byte[0]);
            grpcReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/grpc");
            var grpcResp = await gwClient.SendAsync(grpcReq);
            var grpcJson = await grpcResp.Content.ReadAsStringAsync();
            var grpcEnv = JsonSerializer.Deserialize<BaseResponse>(grpcJson);
            Require(grpcEnv != null && grpcEnv.StatusCode == 403 && !grpcEnv.Success, "gRPC over gateway blocked with 403 envelope");
        });

        await CheckAsync("file_cluster_reload_cannot_expose_rpc", async () =>
        {
            // Embed endpoint is allowed and returns 410
            using var embedReq = new HttpRequestMessage(HttpMethod.Post, "/File/api/UploadFile/embed");
            embedReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateTestJwt(Guid.NewGuid(), key: jwtKey));
            embedReq.Content = new MultipartFormDataContent();
            var embedResp = await gwClient.SendAsync(embedReq);
            var embedJson = await embedResp.Content.ReadAsStringAsync();
            var embedEnv = JsonSerializer.Deserialize<BaseResponse>(embedJson);
            Require(embedEnv != null && embedEnv.StatusCode == 410, "embed route forwarded and returns 410");

            // Direct route /file.FileProto/... without /File prefix is 404 or blocked
            var rpcDirectResp = await gwClient.PostAsync("/file.FileProto/UploadData", new ByteArrayContent(new byte[0]));
            Require(rpcDirectResp.StatusCode == System.Net.HttpStatusCode.NotFound || !rpcDirectResp.IsSuccessStatusCode, "direct RPC route not exposed");
        });
    }
    finally
    {
        await gwApp.StopAsync();
        await fileApp.StopAsync();
        await otherApp.StopAsync();
        Require(Path.GetDirectoryName(Path.GetFullPath(fixtureDir)) == temporaryRoot, "Unsafe fixture cleanup path.");
        Directory.Delete(fixtureDir, recursive: true);
    }
}

async Task CheckAsync(string name, Func<Task> check)
{
    try
    {
        await check();
        Console.WriteLine($"PASS {name}");
    }
    catch (Exception ex)
    {
        failures++;
        Console.Error.WriteLine($"FAIL {name}: {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
    }
}

static void Require(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

sealed class FaultyStream : Stream
{
    private readonly byte[] _data;
    private readonly int _failAfterBytes;
    private readonly Exception _exceptionToThrow;
    private int _position;

    public FaultyStream(byte[] data, int failAfterBytes, Exception exceptionToThrow)
    {
        _data = data;
        _failAfterBytes = failAfterBytes;
        _exceptionToThrow = exceptionToThrow;
    }

    public override bool CanRead => true;
    public override bool CanSeek => true;
    public override bool CanWrite => false;
    public override long Length => _data.Length;
    public override long Position { get => _position; set => _position = (int)value; }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin)
    {
        _position = (int)offset;
        return _position;
    }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (_position >= _failAfterBytes)
        {
            throw _exceptionToThrow;
        }

        var toRead = Math.Min(count, Math.Min(_data.Length - _position, _failAfterBytes - _position));
        if (toRead <= 0)
        {
            throw _exceptionToThrow;
        }

        Array.Copy(_data, _position, buffer, offset, toRead);
        _position += toRead;
        return toRead;
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Read(buffer, offset, count));
    }

    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_position >= _failAfterBytes)
        {
            throw _exceptionToThrow;
        }

        var toRead = Math.Min(buffer.Length, Math.Min(_data.Length - _position, _failAfterBytes - _position));
        if (toRead <= 0)
        {
            throw _exceptionToThrow;
        }

        _data.AsSpan(_position, toRead).CopyTo(buffer.Span);
        _position += toRead;
        return ValueTask.FromResult(toRead);
    }
}
