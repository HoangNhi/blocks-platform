namespace Blocks.Shared.DTOs.Base
{
    public class GetListPagingRequest
    {
        public string? TextSearch { get; set; } = string.Empty;
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; } = 10;
    }
}
