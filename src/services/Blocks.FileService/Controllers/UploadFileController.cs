using Blocks.Shared.DTOs.Base;
using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.FileService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UploadFileController : BaseController<UploadFileController>
    {
        IUploadFileService _service;

        public UploadFileController(IUploadFileService service)
        {
            _service = service;
        }

        [HttpPost]
        [RequestSizeLimit(52428800)] // 50MB limit
        [RequestFormLimits(MultipartBodyLengthLimit = 52428800)]
        public async Task<IActionResult> Post(List<IFormFile> files, [FromForm] string FolderName)
        {
            await _service.Insert(files, FolderName);
            return Ok(new BaseResponse(true, 200));
        }

        [HttpPost("embed")]
        [RequestSizeLimit(52428800)]
        [RequestFormLimits(MultipartBodyLengthLimit = 52428800)]
        public async Task<IActionResult> Embed(List<IFormFile> files, [FromForm] string FolderName)
        {
            var result = await _service.InsertAndReturn(files, FolderName);
            return Ok(new BaseResponse<List<ModelAttachment>>(true, 200, result));
        }
    }
}
