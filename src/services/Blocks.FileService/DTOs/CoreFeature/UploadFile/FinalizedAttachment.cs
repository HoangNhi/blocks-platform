using Blocks.Shared.DTOs.Base;

namespace Blocks.FileService.DTOs.CoreFeature.UploadFile;

public sealed record FinalizedAttachment(
    ModelAttachment Attachment,
    string SourceSha256);