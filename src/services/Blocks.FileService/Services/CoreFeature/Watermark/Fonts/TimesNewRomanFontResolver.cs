using PdfSharp.Fonts;

namespace Blocks.FileService.Services.CoreFeature.Watermark.Fonts;

public sealed class TimesNewRomanFontResolver : IFontResolver
{
    private const string FaceRegular = "serif-regular";
    private const string FaceBold = "serif-bold";
    private const string FaceItalic = "serif-italic";
    private const string FaceBoldItalic = "serif-bold-italic";

    private static readonly string[] DefaultSearchDirectories =
    {
        "/usr/share/fonts/truetype/msttcorefonts",
        "/usr/share/fonts/truetype/liberation",
        "/usr/share/fonts/truetype/liberation2",
        "/usr/share/fonts/truetype/dejavu",
        "C:/Windows/Fonts"
    };

    private readonly Dictionary<string, string> _faceToFontPath;

    public TimesNewRomanFontResolver(IEnumerable<string>? searchDirectories = null)
    {
        var directories = (searchDirectories ?? DefaultSearchDirectories)
            .Where(Directory.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        _faceToFontPath = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [FaceRegular] = ResolveFontPath(
                directories,
                primaryCandidates: new[] { "Times_New_Roman.ttf", "times.ttf" },
                secondaryCandidates: new[] { "LiberationSerif-Regular.ttf" },
                tertiaryCandidates: new[] { "DejaVuSerif.ttf" }),

            [FaceBold] = ResolveFontPath(
                directories,
                primaryCandidates: new[] { "Times_New_Roman_Bold.ttf", "timesbd.ttf" },
                secondaryCandidates: new[] { "LiberationSerif-Bold.ttf" },
                tertiaryCandidates: new[] { "DejaVuSerif-Bold.ttf" }),

            [FaceItalic] = ResolveFontPath(
                directories,
                primaryCandidates: new[] { "Times_New_Roman_Italic.ttf", "timesi.ttf" },
                secondaryCandidates: new[] { "LiberationSerif-Italic.ttf" },
                tertiaryCandidates: new[] { "DejaVuSerif-Italic.ttf" }),

            [FaceBoldItalic] = ResolveFontPath(
                directories,
                primaryCandidates: new[] { "Times_New_Roman_Bold_Italic.ttf", "timesbi.ttf" },
                secondaryCandidates: new[] { "LiberationSerif-BoldItalic.ttf" },
                tertiaryCandidates: new[] { "DejaVuSerif-BoldItalic.ttf" })
        };
    }

    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic)
    {
        if (!IsSupportedFamily(familyName))
        {
            return null;
        }

        var faceName = (bold, italic) switch
        {
            (true, true) => FaceBoldItalic,
            (true, false) => FaceBold,
            (false, true) => FaceItalic,
            _ => FaceRegular
        };

        return new FontResolverInfo(faceName);
    }

    public byte[]? GetFont(string faceName)
    {
        return _faceToFontPath.TryGetValue(faceName, out var path)
            ? File.ReadAllBytes(path)
            : null;
    }

    private static bool IsSupportedFamily(string familyName)
    {
        if (string.IsNullOrWhiteSpace(familyName))
        {
            return false;
        }

        var normalized = new string(familyName
            .Where(character => !char.IsWhiteSpace(character))
            .ToArray())
            .ToLowerInvariant();

        return normalized is "timesnewroman"
            or "times"
            or "liberationserif"
            or "dejavuserif";
    }

    private static string ResolveFontPath(
        IReadOnlyCollection<string> directories,
        IReadOnlyCollection<string> primaryCandidates,
        IReadOnlyCollection<string> secondaryCandidates,
        IReadOnlyCollection<string> tertiaryCandidates)
    {
        var resolved = FindFirstExisting(directories, primaryCandidates)
            ?? FindFirstExisting(directories, secondaryCandidates)
            ?? FindFirstExisting(directories, tertiaryCandidates);

        return resolved ?? throw new InvalidOperationException(
            "Không tìm thấy phông serif được hỗ trợ cho PdfSharp. Đã kiểm tra Times New Roman, Liberation Serif và DejaVu Serif.");
    }

    private static string? FindFirstExisting(
        IReadOnlyCollection<string> directories,
        IReadOnlyCollection<string> candidates)
    {
        foreach (var directory in directories)
        {
            foreach (var candidate in candidates)
            {
                var fullPath = Path.Combine(directory, candidate);
                if (File.Exists(fullPath))
                {
                    return fullPath;
                }
            }
        }

        return null;
    }
}
