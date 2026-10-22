using Blocks.FileService.Configs;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.FileService.Services.Grpc;
using Blocks.Shared.Exceptions;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

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
            var attachments = service.UploadData(relatedId, "System", "Attachments", folderId);
            Require(attachments.Count == 1, "Finalized attachment was not returned.");
            var original = await service.PreviewFileAsync(attachments[0].FileUrl);
            Require(original.FileContent.SequenceEqual(bytes), "Finalized attachment bytes changed.");
            Require(service.DeleteData(new[] { attachments[0].FileUrl }), "Attachment deletion failed.");
            Require(!File.Exists(Path.Combine(privateRoot, "Files", attachments[0].FileUrl)), "Deleted attachment remains at its old path.");

            var avatarFolderId = Guid.NewGuid().ToString("D");
            using var avatarStream = new MemoryStream(bytes);
            var avatar = new FormFile(avatarStream, 0, bytes.Length, "files", "avatar.png");
            await service.Insert(new List<IFormFile> { avatar }, avatarFolderId);
            var avatarPath = service.UploadAvatar(avatarFolderId, "");
            Require(avatarPath.StartsWith("System/Avatar/", StringComparison.Ordinal), "Avatar path changed.");
            var avatarFileName = Path.GetFileName(avatarPath);
            var storedAvatarPath = Path.Combine(privateRoot, "Avatars", avatarFileName);
            Require(File.Exists(storedAvatarPath), "Stored avatar does not exist.");
            Require((await File.ReadAllBytesAsync(storedAvatarPath)).SequenceEqual(bytes), "Avatar bytes changed.");
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
                service.UploadData(Guid.NewGuid(), "UnregisteredService", "UnregisteredModule", folderId);
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
