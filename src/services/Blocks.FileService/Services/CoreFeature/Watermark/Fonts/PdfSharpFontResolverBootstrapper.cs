using PdfSharp.Fonts;

namespace Blocks.FileService.Services.CoreFeature.Watermark.Fonts;

public static class PdfSharpFontResolverBootstrapper
{
    private static readonly object SyncRoot = new();
    private static bool _configured;

    public static void EnsureConfigured()
    {
        if (_configured)
        {
            return;
        }

        lock (SyncRoot)
        {
            if (_configured)
            {
                return;
            }

            if (GlobalFontSettings.FontResolver == null)
            {
                GlobalFontSettings.FontResolver = new NotoSansFontResolver();
            }

            _configured = true;
        }
    }
}
