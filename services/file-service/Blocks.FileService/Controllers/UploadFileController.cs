using Blocks.Shared.DTOs.Base;
using Blocks.FileService.Authorization;
using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.FileService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UploadFileController : BaseController<UploadFileController>
    {
        private readonly IUploadFileService _service;
        private readonly SystemFunctionalAuthorizationClient _authorization;

        public UploadFileController(IUploadFileService service, SystemFunctionalAuthorizationClient authorization)
        {
            _service = service;
            _authorization = authorization;
        }

        [HttpPost]
        [RequestSizeLimit(52428800)] // 50MB limit
        [RequestFormLimits(MultipartBodyLengthLimit = 52428800)]
        public async Task<IActionResult> Post(List<IFormFile> files, [FromForm] string FolderName)
        {
            var failure = await CheckAsync(Blocks.Shared.Authorization.FunctionalPermissionAction.ADD);
            if (failure is not null)
            {
                return failure;
            }

            await _service.Insert(files, FolderName);
            return Ok(new BaseResponse(true, 200));
        }

        [HttpPost("embed")]
        [RequestSizeLimit(52428800)]
        [RequestFormLimits(MultipartBodyLengthLimit = 52428800)]
        public async Task<IActionResult> Embed(List<IFormFile> files, [FromForm] string FolderName)
        {
            var failure = await CheckAsync(Blocks.Shared.Authorization.FunctionalPermissionAction.ADD);
            if (failure is not null)
            {
                return failure;
            }

            var result = await _service.InsertAndReturn(files, FolderName);
            return Ok(new BaseResponse<List<ModelAttachment>>(true, 200, result));
        }

        private async Task<IActionResult?> CheckAsync(Blocks.Shared.Authorization.FunctionalPermissionAction action)
        {
            var result = await _authorization.CheckAsync("files.library", action, HttpContext.RequestAborted);
            if (!result.Authenticated)
            {
                return Unauthorized();
            }

            if (!result.AuthorityAvailable)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable);
            }

            return result.Allowed ? null : StatusCode(StatusCodes.Status403Forbidden);
        }
    }
}
