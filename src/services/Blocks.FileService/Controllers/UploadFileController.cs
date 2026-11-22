using Blocks.Shared.DTOs.Base;
using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Microsoft.AspNetCore.Mvc;
using Blocks.FileService.Infrastructure.Filters;

namespace Blocks.FileService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UploadFileController : BaseController<UploadFileController>
    {
        private readonly IUploadFileService _service;

        public UploadFileController(IUploadFileService service)
        {
            _service = service;
        }

        [HttpPost]
        [ServiceFilter(typeof(KnowledgeHubUploadPermissionFilter))]
        [RequestSizeLimit(53477376)] // 51 MiB multipart envelope
        [RequestFormLimits(MultipartBodyLengthLimit = 53477376)]
        public async Task<IActionResult> Post(List<IFormFile> files, [FromForm] string FolderName)
        {
            var purpose = HttpContext.Items.TryGetValue(
                KnowledgeHubUploadPermissionFilter.ValidatedPurposeItem,
                out var value)
                ? value as string
                : null;

            await _service.Insert(files, FolderName, HttpContext.RequestAborted, purpose);
            return Ok(new BaseResponse(true, 200));
        }

        [HttpPost("embed")]
        [RequestSizeLimit(52428800)]
        public IActionResult Embed()
        {
            return Ok(new BaseResponse(false, 410, "SAR embeds are retired"));
        }
    }
}
