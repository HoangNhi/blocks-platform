using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Blocks.FileService.Services.CoreFeature.Watermark
{
    public class PdfCacheCleanupJob : BackgroundService
    {
        private readonly ILogger<PdfCacheCleanupJob> _logger;
        private readonly string _cacheDir;
        private readonly TimeSpan _retention;
        private readonly TimeSpan _interval;

        public PdfCacheCleanupJob(
            IConfiguration configuration,
            ILogger<PdfCacheCleanupJob> logger,
            string? webRootOverride = null)
        {
            _logger = logger;

            var dirName = configuration["PdfCache:CacheDirectoryName"] ?? "_office_pdf_cache";
            var retentionMonths = int.TryParse(configuration["PdfCache:RetentionMonths"], out var months)
                ? months
                : 6;
            var cleanupIntervalHours = int.TryParse(configuration["PdfCache:CleanupIntervalHours"], out var hours)
                ? hours
                : 24;

            var webRoot = webRootOverride ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            _cacheDir = Path.Combine(webRoot, dirName);
            _retention = TimeSpan.FromDays(Math.Max(1, retentionMonths) * 30d);
            _interval = TimeSpan.FromHours(Math.Max(1, cleanupIntervalHours));
        }

        public async Task RunCleanupAsync(CancellationToken cancellationToken)
        {
            if (!Directory.Exists(_cacheDir))
            {
                return;
            }

            var cutoff = DateTime.UtcNow.Subtract(_retention);

            foreach (var file in Directory.EnumerateFiles(_cacheDir, "*.pdf", SearchOption.TopDirectoryOnly))
            {
                cancellationToken.ThrowIfCancellationRequested();

                try
                {
                    var lastAccess = File.GetLastAccessTimeUtc(file);
                    if (lastAccess >= cutoff)
                    {
                        continue;
                    }

                    File.Delete(file);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể xóa file cache Office: {FilePath}", file);
                }
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var timer = new PeriodicTimer(_interval);

            while (!stoppingToken.IsCancellationRequested)
            {
                await RunCleanupAsync(stoppingToken);

                try
                {
                    if (!await timer.WaitForNextTickAsync(stoppingToken))
                    {
                        break;
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }
}
