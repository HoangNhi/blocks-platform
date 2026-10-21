using Blocks.Shared.DTOs.Base;
using Blocks.CatalogService.DTOs.Base;
using Blocks.CatalogService.DTOs.Common;
using Blocks.Shared.Common;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Requests;
using Blocks.CatalogService.Helpers;
using Blocks.CatalogService.Services.CoreFeature.StandardSet;
using Microsoft.AspNetCore.Mvc;

namespace Blocks.CatalogService.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StandardSetController : BaseController<StandardSetController>
    {
        private readonly IStandardSetService _service;

        public StandardSetController(IStandardSetService service)
        {
            _service = service;
        }

        [HttpPost, Route("get-list")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetList(StandardSetGetListPagingRequest request)
        {
            var result = await _service.GetList(request);
            return Ok(new BaseResponse<GetListPagingResponse<ModelStandardSetGetListPaging>> { Data = result, Success = true });
        }

        [HttpGet, Route("get-by-id")]
        [AttributePermission(Action = ActionType.NONE)]
        public async Task<IActionResult> GetById([FromQuery] GetByIdRequest request)
        {
            var result = await _service.GetById(request);
            return Ok(new BaseResponse<ModelStandardSet> { Data = result, Success = true });
        }

        [HttpPost("insert")]
        [AttributePermission(Action = ActionType.ADD)]
        public async Task<IActionResult> Insert([FromBody] StandardSetRequest request)
        {
            await _service.Insert(request);
            return Ok(new BaseResponse(true, 200));
        }

        [HttpPut, Route("update")]
        [AttributePermission(Action = ActionType.UPDATE)]
        public async Task<IActionResult> Update(StandardSetRequest request)
        {
            await _service.Update(request);
            return Ok(new BaseResponse(true, 200));
        }

        [HttpDelete, Route("delete-list")]
        [AttributePermission(Action = ActionType.DELETE)]
        public async Task<IActionResult> DeleteList([FromBody] DeleteListRequest request)
        {
            await _service.DeleteList(request);
            return Ok(new BaseResponse(true, 200));
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
