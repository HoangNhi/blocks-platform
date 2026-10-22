using Blocks.FileService.Configs;
using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.FileService.Services.Grpc;
using Blocks.Shared.Exceptions;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

var temporaryRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
var root = Path.Combine(temporaryRoot, $"blocks-fileservice-check-{Guid.NewGuid():N}");
var webRoot = Path.Combine(root, "wwwroot");
Directory.CreateDirectory(webRoot);
var failures = 0;

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
        ["GrpcClients:SystemService"] = "http://127.0.0.1:1"
    });
    builder.ExecuteConfigService();
    await using var app = builder.Build();
    using var scope = app.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<IUploadFileService>();
    var grpc = new FileGrpcService(service);
    var bytes = new byte[] { 0, 1, 2, 127, 128, 255 };
    await File.WriteAllBytesAsync(Path.Combine(webRoot, "original.txt"), bytes);

    await CheckAsync("legacy_watermark_is_rejected_without_returning_original", async () =>
    {
        try
        {
            await grpc.PreviewFile(new PreviewFileRequest
            {
                FileUrl = "original.txt",
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
            var name = "original" + extension;
            await File.WriteAllBytesAsync(Path.Combine(webRoot, name), bytes);
            var result = await grpc.PreviewFile(new PreviewFileRequest { FileUrl = name }, null!);
            Require(result.FileContent.ToByteArray().SequenceEqual(bytes), "Original bytes changed.");
            Require(result.FileName == name, "Original file name changed.");
            Require(result.ContentType == contentType, "Original content type changed.");
            Require(result.OriginalContentType == contentType, "Original content type metadata changed.");
            Require(!result.HasWatermark && result.ConvertedContentType == "", "Processing metadata was returned.");
        });
    }

    await CheckAsync("empty_or_missing_original_is_rejected", async () =>
    {
        foreach (var path in new[] { "", "missing.txt" })
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
        using var uploadStream = new MemoryStream(bytes);
        var upload = new FormFile(uploadStream, 0, bytes.Length, "files", "attachment.txt");
        await service.Insert(new List<IFormFile> { upload }, "attachments");
        var attachments = service.UploadData(Guid.NewGuid(), "System", "Checks", "attachments");
        Require(attachments.Count == 1, "Finalized attachment was not returned.");
        var original = await service.PreviewFileAsync(attachments[0].FileUrl);
        Require(original.FileContent.SequenceEqual(bytes), "Finalized attachment bytes changed.");
        Require(service.DeleteData(new[] { attachments[0].FileUrl }), "Attachment deletion failed.");
        Require(!File.Exists(Path.Combine(webRoot, attachments[0].FileUrl)), "Deleted attachment remains at its old path.");

        using var avatarStream = new MemoryStream(bytes);
        var avatar = new FormFile(avatarStream, 0, bytes.Length, "files", "avatar.png");
        await service.Insert(new List<IFormFile> { avatar }, "avatar");
        var avatarPath = service.UploadAvatar("avatar", "");
        Require(avatarPath.StartsWith("System/Avatar/", StringComparison.Ordinal), "Avatar path changed.");
        Require((await File.ReadAllBytesAsync(Path.Combine(webRoot, avatarPath))).SequenceEqual(bytes),
            "Avatar bytes changed.");
    });
}
finally
{
    Require(Path.GetDirectoryName(Path.GetFullPath(root)) == temporaryRoot, "Unsafe fixture cleanup path.");
    Directory.Delete(root, recursive: true);
}

Console.WriteLine($"FileService checks: {failures} failure(s).");
return failures == 0 ? 0 : 1;

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
        Console.Error.WriteLine($"FAIL {name}: {ex.GetType().Name}: {ex.Message}");
    }
}

static void Require(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}
