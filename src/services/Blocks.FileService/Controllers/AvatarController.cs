using Blocks.FileService.DTOs.Base;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.Shared.DTOs.Base;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.RegularExpressions;

namespace Blocks.FileService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class AvatarController : BaseController<AvatarController>
    {
        private static readonly Regex RasterFileNameRegex = new(
            @"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg|jpeg|webp)$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private readonly IUploadFileService _uploadFileService;

        public AvatarController(IUploadFileService uploadFileService)
        {
            _uploadFileService = uploadFileService;
        }

        [HttpGet("{fileName}")]
        public async Task<IActionResult> Get(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName) || !RasterFileNameRegex.IsMatch(fileName))
            {
                return BadRequest(new BaseResponse(false, 400, "Tên tệp hình ảnh đại diện không hợp lệ"));
            }

            Response.Headers["Cache-Control"] = "no-store";
            Response.Headers["X-Content-Type-Options"] = "nosniff";

            var preview = await _uploadFileService.PreviewAvatarAsync(fileName, HttpContext.RequestAborted);
            return File(preview.FileContent, preview.ContentType);
        }
    }
}
