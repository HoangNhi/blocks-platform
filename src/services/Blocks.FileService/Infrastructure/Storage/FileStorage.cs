using Blocks.Shared.Exceptions;

namespace Blocks.FileService.Infrastructure.Storage
{
    public enum StorageArea
    {
        Temp,
        Files,
        Avatars,
        Deleted,
        LegacyQuarantine
    }

    public sealed class FileStorage
    {
        public const long MaxFileBytes = 52428800; // 50MB

        private readonly string _rootPath;
        private readonly Dictionary<StorageArea, string> _areaPaths;

        public FileStorage(IConfiguration configuration, IWebHostEnvironment environment)
        {
            var configuredRoot = configuration["FileStorage:RootPath"];
            if (string.IsNullOrWhiteSpace(configuredRoot))
            {
                throw new InvalidOperationException("FileStorage:RootPath cấu hình thiếu hoặc rỗng.");
            }

            if (!Path.IsPathFullyQualified(configuredRoot))
            {
                throw new InvalidOperationException("FileStorage:RootPath phải là đường dẫn tuyệt đối.");
            }

            var fullRoot = Path.GetFullPath(configuredRoot);
            var cleanRoot = Path.TrimEndingDirectorySeparator(fullRoot);

            var webRoot = environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot");
            var fullWebRoot = Path.GetFullPath(webRoot);
            var cleanWebRoot = Path.TrimEndingDirectorySeparator(fullWebRoot);

            var comparison = OperatingSystem.IsWindows()
                ? StringComparison.OrdinalIgnoreCase
                : StringComparison.Ordinal;

            if (string.Equals(cleanRoot, cleanWebRoot, comparison))
            {
                throw new InvalidOperationException("FileStorage:RootPath không được trùng web root.");
            }

            var webPrefix = Path.EndsInDirectorySeparator(cleanWebRoot) ? cleanWebRoot : cleanWebRoot + Path.DirectorySeparatorChar;
            var rootPrefix = Path.EndsInDirectorySeparator(cleanRoot) ? cleanRoot : cleanRoot + Path.DirectorySeparatorChar;
            if (cleanRoot.StartsWith(webPrefix, comparison))
            {
                throw new InvalidOperationException("FileStorage:RootPath không được nằm trong web root.");
            }

            if (cleanWebRoot.StartsWith(rootPrefix, comparison))
            {
                throw new InvalidOperationException("FileStorage:RootPath không được chứa web root.");
            }

            var currentCheck = new DirectoryInfo(cleanRoot);
            while (currentCheck != null)
            {
                if (currentCheck.LinkTarget != null || (currentCheck.Exists && currentCheck.Attributes.HasFlag(FileAttributes.ReparsePoint)))
                {
                    throw new InvalidOperationException($"FileStorage:RootPath không được đi qua symlink/reparse point: '{currentCheck.FullName}'.");
                }
                currentCheck = currentCheck.Parent;
            }

            Directory.CreateDirectory(cleanRoot);
            var rootDir = new DirectoryInfo(cleanRoot);
            for (var cur = rootDir; cur != null; cur = cur.Parent)
            {
                if (cur.Exists && (cur.Attributes.HasFlag(FileAttributes.ReparsePoint) || cur.LinkTarget != null))
                {
                    throw new InvalidOperationException($"FileStorage:RootPath không được đi qua symlink/reparse point: '{cur.FullName}'.");
                }
            }

            _rootPath = cleanRoot;
            _areaPaths = new Dictionary<StorageArea, string>
            {
                [StorageArea.Temp] = Path.Combine(cleanRoot, "Temp"),
                [StorageArea.Files] = Path.Combine(cleanRoot, "Files"),
                [StorageArea.Avatars] = Path.Combine(cleanRoot, "Avatars"),
                [StorageArea.Deleted] = Path.Combine(cleanRoot, "Deleted"),
                [StorageArea.LegacyQuarantine] = Path.Combine(cleanRoot, "LegacyQuarantine")
            };

            foreach (var areaPath in _areaPaths.Values)
            {
                RejectLinks(areaPath);
                Directory.CreateDirectory(areaPath);
            }
        }

        public string RootPath => _rootPath;

        public string Resolve(StorageArea area, params string[] segments)
        {
            if (!_areaPaths.TryGetValue(area, out var areaRoot))
            {
                throw new BusinessException("Vùng lưu trữ không hợp lệ", 400);
            }

            ArgumentNullException.ThrowIfNull(segments);
            var parts = new string[segments.Length + 1];
            parts[0] = areaRoot;

            for (var i = 0; i < segments.Length; i++)
            {
                var segment = segments[i];
                ValidateSegment(segment);
                parts[i + 1] = segment;
            }

            var combined = Path.Combine(parts);
            var fullPath = Path.GetFullPath(combined);

            var comparison = OperatingSystem.IsWindows()
                ? StringComparison.OrdinalIgnoreCase
                : StringComparison.Ordinal;

            if (!fullPath.Equals(areaRoot, comparison) &&
                !fullPath.StartsWith(areaRoot + Path.DirectorySeparatorChar, comparison))
            {
                throw new BusinessException("Đường dẫn tệp vượt quá ranh giới vùng lưu trữ", 400);
            }

            RejectLinks(fullPath);
            return fullPath;
        }

        private static void RejectLinks(string path)
        {
            for (var cur = path; !string.IsNullOrEmpty(cur); cur = Path.GetDirectoryName(cur))
            {
                var fi = new FileInfo(cur);
                if (fi.LinkTarget != null || (fi.Exists && fi.Attributes.HasFlag(FileAttributes.ReparsePoint)))
                {
                    throw new BusinessException("Tệp hoặc thư mục đi qua symlink hoặc reparse point", 400);
                }
                var di = new DirectoryInfo(cur);
                if (di.LinkTarget != null || (di.Exists && di.Attributes.HasFlag(FileAttributes.ReparsePoint)))
                {
                    throw new BusinessException("Tệp hoặc thư mục đi qua symlink hoặc reparse point", 400);
                }
            }

        }

        public string ResolveActiveKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key) ||
                key.StartsWith('/') ||
                key.EndsWith('/') ||
                key.Contains("//") ||
                key.Contains('\\') ||
                key.Contains(':') ||
                key.Contains(".."))
            {
                throw new BusinessException("Đường dẫn tệp không hợp lệ", 400);
            }

            var segments = key.Split('/');
            foreach (var segment in segments)
            {
                ValidateSegment(segment);
            }
            // System/Avatar/<file-id>.<ext>
            if (segments.Length == 3 &&
                string.Equals(segments[0], "System", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(segments[1], "Avatar", StringComparison.OrdinalIgnoreCase))
            {
                var fileName = segments[2];
                return ResolveAvatar(fileName);
            }

            // System/Attachments/<related-id>/<file-id>.<ext>
            if (segments.Length == 4 &&
                string.Equals(segments[0], "System", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(segments[1], "Attachments", StringComparison.OrdinalIgnoreCase))
            {
                var relatedId = segments[2];
                if (relatedId.Length != 36 || !Guid.TryParseExact(relatedId, "D", out var relatedGuid) || relatedGuid == Guid.Empty)
                {
                    throw new BusinessException("Định danh liên kết không hợp lệ", 400);
                }

                var fileName = segments[3];
                ValidateFileNameWithGuid(fileName);
                return Resolve(StorageArea.Files, "System", "Attachments", relatedId, fileName);
            }

            throw new BusinessException("Đường dẫn tệp không hợp lệ hoặc mục tiêu chưa đăng ký", 400);
        }

        public string ResolveSession(Guid actorId, Guid folderId)
        {
            if (actorId == Guid.Empty || folderId == Guid.Empty)
            {
                throw new BusinessException("Định danh phiên hoặc người dùng không hợp lệ", 400);
            }

            return Resolve(StorageArea.Temp, actorId.ToString("D"), folderId.ToString("D"));
        }

        public string ResolveAvatar(string fileName)
        {
            ValidateFileNameWithGuid(fileName);
            if (Path.GetExtension(fileName).ToLowerInvariant() is not (".png" or ".jpg" or ".jpeg" or ".webp"))
                throw new BusinessException("Định dạng ảnh đại diện không hợp lệ", 400);
            return Resolve(StorageArea.Avatars, fileName);
        }

        private static void ValidateSegment(string segment)
        {
            if (string.IsNullOrWhiteSpace(segment) || segment != segment.Trim())
            {
                throw new BusinessException("Thành phần đường dẫn không được rỗng", 400);
            }

            if (segment == "." || segment == "..")
            {
                throw new BusinessException("Thành phần đường dẫn không hợp lệ", 400);
            }

            if (segment.Contains('/') || segment.Contains('\\') || segment.Contains(':') ||
                segment.Contains("..") || segment.Any(char.IsControl))
            {
                throw new BusinessException("Thành phần đường dẫn chứa ký tự không hợp lệ", 400);
            }
        }

        private static void ValidateFileNameWithGuid(string fileName)
        {
            ValidateSegment(fileName);
            var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
            var ext = Path.GetExtension(fileName);

            if (ext.Length < 2 || ext.Skip(1).Any(c => !char.IsAsciiLetterOrDigit(c)) ||
                nameWithoutExt.Length != 36 || !Guid.TryParseExact(nameWithoutExt, "D", out var guid) || guid == Guid.Empty)
            {
                throw new BusinessException("Tên tệp phải có định dạng GUID canonical hợp lệ", 400);
            }
        }
    }
}
