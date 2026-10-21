namespace Blocks.FileService.Services.CoreFeature.Watermark
{
    public interface IOfficeConversionService
    {
        Task<byte[]> ConvertToPdfAsync(
            string absoluteFilePath,
            Guid fileId,
            CancellationToken cancellationToken = default);
    }
}
