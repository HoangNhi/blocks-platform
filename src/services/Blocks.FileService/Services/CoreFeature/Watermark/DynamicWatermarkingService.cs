using System.Numerics;
using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Services.CoreFeature.Watermark.Fonts;
using AutoDependencyRegistration.Attributes;
using Microsoft.AspNetCore.StaticFiles;
using Blocks.Shared.Exceptions;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf.IO;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Processing;

namespace Blocks.FileService.Services.CoreFeature.Watermark
{
    [RegisterClassAsTransient]
    public class DynamicWatermarkingService : IDynamicWatermarkingService
    {
        private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".webp"
        };

        private static readonly HashSet<string> OfficeExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".doc",
            ".docx",
            ".xls",
            ".xlsx"
        };

        private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();
        private static readonly Lazy<FontFamily> NotoSansFontFamily = new(LoadNotoSansFontFamily);

        private readonly IOfficeConversionService _officeConversionService;

        static DynamicWatermarkingService()
        {
            if (OperatingSystem.IsLinux())
            {
                PdfSharpFontResolverBootstrapper.EnsureConfigured();
                return;
            }

            GlobalFontSettings.UseWindowsFontsUnderWindows = true;
        }

        public DynamicWatermarkingService(IOfficeConversionService officeConversionService)
        {
            _officeConversionService = officeConversionService;
        }

        public async Task<(byte[] Content, string ContentType, bool HasWatermark)> ApplyAsync(
            byte[] fileContent,
            string fileExtension,
            Guid? fileId,
            string absoluteFilePath,
            WatermarkConfig config,
            CancellationToken cancellationToken = default)
        {
            if (fileContent.Length == 0 || string.IsNullOrWhiteSpace(config.Text))
            {
                return (fileContent, ResolveContentType(fileExtension), false);
            }

            if (string.Equals(fileExtension, ".pdf", StringComparison.OrdinalIgnoreCase))
            {
                var (content, hasWatermark) = ApplyPdf(fileContent, config);
                return (content, ResolveContentType(fileExtension), hasWatermark);
            }

            if (ImageExtensions.Contains(fileExtension))
            {
                var (content, hasWatermark) = ApplyImage(fileContent, fileExtension, config);
                return (content, ResolveContentType(fileExtension), hasWatermark);
            }

            if (OfficeExtensions.Contains(fileExtension))
            {
                if (!fileId.HasValue || fileId.Value == Guid.Empty)
                {
                    throw new BusinessException(
                        "Tính năng xem trước Word/Excel bắt buộc phải có FileId để tối ưu bộ nhớ đệm.");
                }

                var pdfBytes = await _officeConversionService.ConvertToPdfAsync(
                    absoluteFilePath,
                    fileId.Value,
                    cancellationToken);

                var (content, hasWatermark) = ApplyPdf(pdfBytes, config);
                return (content, "application/pdf", hasWatermark);
            }

            return (fileContent, ResolveContentType(fileExtension), false);
        }

        private static string ResolveContentType(string fileExtension)
        {
            if (string.IsNullOrWhiteSpace(fileExtension))
            {
                return "application/octet-stream";
            }

            if (!fileExtension.StartsWith('.'))
            {
                fileExtension = "." + fileExtension;
            }

            return ContentTypeProvider.TryGetContentType("file" + fileExtension, out var contentType)
                ? contentType
                : "application/octet-stream";
        }

        private static (byte[] Content, bool HasWatermark) ApplyPdf(byte[] fileContent, WatermarkConfig config)
        {
            using var inputStream = new MemoryStream(fileContent);
            using var document = PdfReader.Open(inputStream, PdfDocumentOpenMode.Modify);

            foreach (var page in document.Pages)
            {
                using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);

                var fontSize = Math.Max(14, Math.Min(page.Width.Point, page.Height.Point) / 12);
                var font = new XFont("Noto Sans", fontSize, XFontStyleEx.Bold);
                var brush = new XSolidBrush(XColor.FromArgb(ClampOpacity(config.Opacity), 80, 80, 80));

                var centerX = page.Width.Point / 2;
                var centerY = page.Height.Point / 2;

                switch (config.Position)
                {
                    case 1:
                        gfx.DrawString(
                            config.Text,
                            font,
                            brush,
                            new XRect(0, 0, page.Width.Point, page.Height.Point),
                            XStringFormats.Center);
                        break;
                    case 2:
                        var repeatFontSize = Math.Max(10, Math.Min(page.Width.Point, page.Height.Point) / 24.0);
                        var repeatFont = new XFont("Noto Sans", repeatFontSize, XFontStyleEx.Bold);
                        DrawRepeatedWatermark(gfx, page.Width.Point, page.Height.Point, config.Text, repeatFont, brush);
                        break;
                    default:
                        gfx.TranslateTransform(centerX, centerY);
                        gfx.RotateTransform(-45);
                        gfx.DrawString(config.Text, font, brush, new XPoint(0, 0), XStringFormats.Center);
                        break;
                }
            }

            using var outputStream = new MemoryStream();
            document.Save(outputStream, false);
            return (outputStream.ToArray(), true);
        }

        private static void DrawRepeatedWatermark(
            XGraphics gfx,
            double pageWidth,
            double pageHeight,
            string text,
            XFont font,
            XBrush brush)
        {
            var stepX = Math.Max(200, pageWidth / 1.5);
            var stepY = Math.Max(160, pageHeight / 2.0);

            for (var y = -stepY; y <= pageHeight + stepY; y += stepY)
            {
                for (var x = -stepX; x <= pageWidth + stepX; x += stepX)
                {
                    var state = gfx.Save();
                    gfx.TranslateTransform(x, y);
                    gfx.RotateTransform(-30);
                    gfx.DrawString(text, font, brush, new XPoint(0, 0), XStringFormats.Center);
                    gfx.Restore(state);
                }
            }
        }

        private static (byte[] Content, bool HasWatermark) ApplyImage(
            byte[] fileContent,
            string fileExtension,
            WatermarkConfig config)
        {
            using var image = Image.Load(fileContent);
            var font = ResolveFont(image.Height);
            if (font == null)
            {
                return (fileContent, false);
            }

            var color = Color.FromRgba(90, 90, 90, ClampOpacity(config.Opacity));

            image.Mutate(ctx =>
            {
                if (config.Position == 2)
                {
                    DrawRepeatedWatermarkOnImage(ctx, image.Width, image.Height, config.Text, font, color);
                    return;
                }

                var drawingOptions = new DrawingOptions();

                if (config.Position == 0)
                {
                    drawingOptions.Transform = Matrix3x2.CreateRotation(
                        -MathF.PI / 4f,
                        new Vector2(image.Width / 2f, image.Height / 2f));
                }

                ctx.DrawText(
                    drawingOptions,
                    config.Text,
                    font,
                    color,
                    new PointF(image.Width / 2f, image.Height / 2f));
            });

            using var outputStream = new MemoryStream();
            SaveImageWithOriginalFormat(image, fileExtension, outputStream);

            return (outputStream.ToArray(), true);
        }

        private static void DrawRepeatedWatermarkOnImage(
            IImageProcessingContext ctx,
            int width,
            int height,
            string text,
            Font font,
            Color color)
        {
            var stepX = Math.Max(250, width / 1.5f);
            var stepY = Math.Max(200, height / 2.0f);

            for (var y = -stepY; y <= height + stepY; y += stepY)
            {
                for (var x = -stepX; x <= width + stepX; x += stepX)
                {
                    ctx.DrawText(
                        new DrawingOptions
                        {
                            Transform = Matrix3x2.CreateRotation(
                                -MathF.PI / 6f,
                                new Vector2(x, y))
                        },
                        text,
                        font,
                        color,
                        new PointF(x, y));
                }
            }
        }

        private static FontFamily LoadNotoSansFontFamily()
        {
            const string resourceName =
                "Blocks.FileService.Services.CoreFeature.Watermark.Fonts.Resources.NotoSans-Bold.ttf";

            var assembly = typeof(DynamicWatermarkingService).Assembly;
            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException(
                    $"Embedded resource '{resourceName}' not found.");

            var collection = new FontCollection();
            return collection.Add(stream);
        }

        private static Font? ResolveFont(int imageHeight)
        {
            var size = Math.Max(18f, imageHeight / 22f);
            return NotoSansFontFamily.Value.CreateFont(size, FontStyle.Bold);
        }

        private static void SaveImageWithOriginalFormat(Image image, string fileExtension, Stream outputStream)
        {
            if (string.Equals(fileExtension, ".jpg", StringComparison.OrdinalIgnoreCase)
                || string.Equals(fileExtension, ".jpeg", StringComparison.OrdinalIgnoreCase))
            {
                image.SaveAsJpeg(outputStream);
                return;
            }

            if (string.Equals(fileExtension, ".gif", StringComparison.OrdinalIgnoreCase))
            {
                image.SaveAsGif(outputStream);
                return;
            }

            if (string.Equals(fileExtension, ".webp", StringComparison.OrdinalIgnoreCase))
            {
                image.SaveAsWebp(outputStream);
                return;
            }

            image.SaveAsPng(outputStream);
        }

        private static byte ClampOpacity(int opacity)
        {
            var safeOpacity = Math.Clamp(opacity, 0, 100);
            return (byte)Math.Round(255 * (safeOpacity / 100d));
        }
    }
}
