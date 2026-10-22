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
