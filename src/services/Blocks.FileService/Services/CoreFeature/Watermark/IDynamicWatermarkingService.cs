using Blocks.FileService.DTOs.Base;

namespace Blocks.FileService.Services.CoreFeature.Watermark
{
    public interface IDynamicWatermarkingService
    {
        Task<(byte[] Content, string ContentType, bool HasWatermark)> ApplyAsync(
            byte[] fileContent,
            string fileExtension,
            Guid? fileId,
            string absoluteFilePath,
            WatermarkConfig config,
            CancellationToken cancellationToken = default);
    }
}
