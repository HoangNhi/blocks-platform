using System.Diagnostics;
using Blocks.Shared.Exceptions;
using AutoDependencyRegistration.Attributes;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Blocks.FileService.Services.CoreFeature.Watermark
{
    [RegisterClassAsSingleton]
    public class OfficeConversionService : IOfficeConversionService
    {
        private readonly IMemoryCache _lockCache;
        private readonly ILogger<OfficeConversionService> _logger;
        private readonly string _cacheDir;
        private readonly int _timeoutSeconds;
        private readonly bool _isLibreOfficeAvailable;

        public OfficeConversionService(
            IMemoryCache lockCache,
            IConfiguration configuration,
            ILogger<OfficeConversionService> logger,
            string? webRootOverride = null)
        {
            _lockCache = lockCache;
            _logger = logger;
            _timeoutSeconds = int.TryParse(
                configuration["PdfCache:ConversionTimeoutSeconds"],
                out var timeoutSeconds)
                ? timeoutSeconds
                : 60;

            var dirName = configuration["PdfCache:CacheDirectoryName"] ?? "_office_pdf_cache";
            var webRoot = webRootOverride ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            _cacheDir = Path.Combine(webRoot, dirName);
            Directory.CreateDirectory(_cacheDir);

            _isLibreOfficeAvailable = CheckLibreOfficeAvailability();
            if (!_isLibreOfficeAvailable)
            {
                _logger.LogWarning(
                    "LibreOffice không khả dụng (soffice not found). Tính năng xem trước Word/Excel sẽ được phục vụ từ cache nếu có.");
            }
        }

        public async Task<byte[]> ConvertToPdfAsync(
            string absoluteFilePath,
            Guid fileId,
            CancellationToken cancellationToken = default)
        {
            if (fileId == Guid.Empty)
            {
                throw new BusinessException(
                    "Tính năng xem trước Word/Excel bắt buộc cung cấp FileId để tối ưu bộ nhớ đệm.");
            }

            if (string.IsNullOrWhiteSpace(absoluteFilePath))
            {
                throw new BusinessException("Đường dẫn tệp không hợp lệ.");
            }

            var cachePath = Path.Combine(_cacheDir, $"{fileId}_converted.pdf");

            if (File.Exists(cachePath))
            {
                File.SetLastAccessTimeUtc(cachePath, DateTime.UtcNow);
                return await File.ReadAllBytesAsync(cachePath, cancellationToken);
            }

            if (!File.Exists(absoluteFilePath))
            {
                throw new BusinessException("Tệp không tồn tại.");
            }

            if (!_isLibreOfficeAvailable)
            {
                throw new BusinessException(
                    "Tính năng xem trước Word/Excel hiện không khả dụng trên máy chủ.");
            }

            var semaphore = GetOrCreateSemaphore(fileId);
            await semaphore.WaitAsync(cancellationToken);
            try
            {
                if (File.Exists(cachePath))
                {
                    File.SetLastAccessTimeUtc(cachePath, DateTime.UtcNow);
                    return await File.ReadAllBytesAsync(cachePath, cancellationToken);
                }

                await RunSofficeAsync(absoluteFilePath, fileId, cancellationToken);

                if (!File.Exists(cachePath))
                {
                    throw new BusinessException("Chuyển đổi tệp thất bại: không tìm thấy file đầu ra.");
                }

                return await File.ReadAllBytesAsync(cachePath, cancellationToken);
            }
            finally
            {
                semaphore.Release();
            }
        }

        private bool CheckLibreOfficeAvailability()
        {
            try
            {
                using var proc = new Process();
                proc.StartInfo = new ProcessStartInfo
                {
                    FileName = "soffice",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                proc.StartInfo.ArgumentList.Add("--version");

                if (!proc.Start())
                {
                    return false;
                }

                if (!proc.WaitForExit(5000))
                {
                    proc.Kill(entireProcessTree: true);
                    return false;
                }

                return proc.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        private async Task RunSofficeAsync(
            string inputPath,
            Guid fileId,
            CancellationToken cancellationToken)
        {
            var cachePath = Path.Combine(_cacheDir, $"{fileId}_converted.pdf");
            using var proc = new Process();
            proc.StartInfo = new ProcessStartInfo
            {
                FileName = "soffice",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            proc.StartInfo.ArgumentList.Add("--headless");
            proc.StartInfo.ArgumentList.Add("--convert-to");
            proc.StartInfo.ArgumentList.Add("pdf");
            proc.StartInfo.ArgumentList.Add("--outdir");
            proc.StartInfo.ArgumentList.Add(_cacheDir);
            proc.StartInfo.ArgumentList.Add(inputPath);

            if (!proc.Start())
            {
                throw new BusinessException("Không thể khởi chạy LibreOffice.");
            }

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(_timeoutSeconds));

            try
            {
                await proc.WaitForExitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                try
                {
                    proc.Kill(entireProcessTree: true);
                }
                catch
                {
                    // Best effort only.
                }

                throw new BusinessException(
                    $"Không thể chuyển đổi tệp trong thời gian cho phép ({_timeoutSeconds} giây).");
            }

            if (proc.ExitCode != 0)
            {
                var error = await proc.StandardError.ReadToEndAsync();
                _logger.LogError(
                    "soffice exited with code {ExitCode} for file {FileId}: {Error}",
                    proc.ExitCode,
                    fileId,
                    error);

                throw new BusinessException("Chuyển đổi tệp thất bại.");
            }

            var inputBaseName = Path.GetFileNameWithoutExtension(inputPath);
            var sofficeOutput = Path.Combine(_cacheDir, $"{inputBaseName}.pdf");
            if (File.Exists(sofficeOutput)
                && !string.Equals(sofficeOutput, cachePath, StringComparison.OrdinalIgnoreCase))
            {
                File.Move(sofficeOutput, cachePath, overwrite: true);
            }
        }

        private SemaphoreSlim GetOrCreateSemaphore(Guid fileId)
        {
            if (_lockCache.TryGetValue(fileId, out SemaphoreSlim? existing) && existing != null)
            {
                return existing;
            }

            var semaphore = new SemaphoreSlim(1, 1);
            var options = new MemoryCacheEntryOptions()
                .SetSlidingExpiration(TimeSpan.FromMinutes(5))
                .RegisterPostEvictionCallback((_, value, _, _) =>
                {
                    (value as SemaphoreSlim)?.Dispose();
                });

            return _lockCache.GetOrCreate(fileId, entry =>
            {
                entry.SetOptions(options);
                return semaphore;
            })!;
        }
    }
}
