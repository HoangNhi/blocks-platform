using PdfSharp.Fonts;

namespace Blocks.FileService.Services.CoreFeature.Watermark.Fonts;

public sealed class NotoSansFontResolver : IFontResolver
{
    private const string FaceName = "noto-sans-bold";
    private const string ResourceName =
        "Blocks.FileService.Services.CoreFeature.Watermark.Fonts.Resources.NotoSans-Bold.ttf";

    private static readonly Lazy<byte[]> FontData = new(LoadFontData);

    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic)
    {
        var normalized = familyName?.Trim().ToLowerInvariant().Replace(" ", "");

        return normalized is "notosans" or "noto sans"
            ? new FontResolverInfo(FaceName)
            : null;
    }

    public byte[]? GetFont(string faceName) =>
        string.Equals(faceName, FaceName, StringComparison.OrdinalIgnoreCase)
            ? FontData.Value
            : null;

    private static byte[] LoadFontData()
    {
        var assembly = typeof(NotoSansFontResolver).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded resource '{ResourceName}' not found. Verify EmbeddedResource entry in .csproj.");

        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        return ms.ToArray();
    }
}
