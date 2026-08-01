namespace Blocks.SystemService.DTOs.Base
{
    public class BaseRequest
    {
        public bool IsActived { get; set; } = true;
        public bool IsEdit { get; set; } = false;
        public int? Sort { get; set; } = 0;
        public string FolderUpload { get; set; } = Guid.NewGuid().ToString();
    }
}
