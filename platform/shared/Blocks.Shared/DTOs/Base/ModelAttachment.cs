namespace Blocks.Shared.DTOs.Base
{
    public class ModelAttachment
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public int ReferenceType { get; set; }

        public Guid RelatedId { get; set; }

        public string FileName { get; set; }

        public string FileExtension { get; set; }

        public double? FileSize { get; set; }

        public string FileUrl { get; set; }

        public string FullFileName { get => FileName + FileExtension; }
    }
}
