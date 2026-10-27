namespace Blocks.Shared.DTOs.Base
{
    public class GetListPagingResponse<T>
    {
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
        public int TotalRow { get; set; }
        public List<T> Data { get; set; }
    }
}
