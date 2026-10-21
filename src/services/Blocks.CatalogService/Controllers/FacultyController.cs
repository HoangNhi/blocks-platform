using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using Blocks.CatalogService.DTOs.Common;
using Blocks.Shared.Common;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Helpers;
using Blocks.CatalogService.Services.CoreFeature.Faculty;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.CatalogService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FacultyController : BaseController<FacultyController>
    {
        private readonly IFacultyService _service;

        public FacultyController(IFacultyService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetList(GetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelFaculty>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelFaculty> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] FacultyRequest request)
        {
            var result = await _service.Insert(request);
            return Ok(new BaseResponse<ModelFaculty> { Data = result, Success = true });
        }

        [HttpPut, Route("update")]
        [AttributePermission(Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(FacultyRequest request)
        {
            var result = await _service.Update(request);
            return Ok(new BaseResponse<ModelFaculty> { Data = result, Success = true });
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            var result = await _service.DeleteList(request);
            return Ok(new BaseResponse<string> { Data = result, Success = true });
        }

        [HttpGet, Route("get-all-combobox")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetAllForCombobox()
        {
            var result = await _service.GetAllForCombobox();
            return Ok(new BaseResponse<List<ModelCombobox>> { Data = result, Success = true });
        }
    }
}
