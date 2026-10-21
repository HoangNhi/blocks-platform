namespace Blocks.FileService.DTOs.Base
{
    public class WatermarkConfig
    {
        public string Text { get; set; } = string.Empty;

        public int Opacity { get; set; } = 25;

        public int Position { get; set; } = 0;
    }
}
