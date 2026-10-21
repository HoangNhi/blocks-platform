using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.StandardSet.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;

namespace Blocks.CatalogService.Services.CoreFeature.StandardSet
{
    [RegisterClassAsTransient]
    public class StandardSetService : IStandardSetService
    {
        private readonly CatalogContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;

        public StandardSetService(
            CatalogContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
        }

        public async Task<ModelStandardSet> GetById(GetByIdRequest request)
        {
            var data = await _context.StandardSets.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelStandardSet>(data);
        }

        public async Task Insert(StandardSetRequest request)
        {
            var data = _context.StandardSets.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên bộ tiêu chuẩn đã tồn tại");
            }

            var add = _mapper.Map<Entities.StandardSet>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            add.CreatedAt = DateTime.UtcNow;

            await _context.StandardSets.AddAsync(add);
            await _context.SaveChangesAsync();
        }

        public async Task Update(StandardSetRequest request)
        {
            var data = _context.StandardSets.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên bộ tiêu chuẩn đã tồn tại");
            }

            var update = await _context.StandardSets.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            update.UpdatedAt = DateTime.UtcNow;

            _context.StandardSets.Update(update);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.StandardSets.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";

                _context.StandardSets.Update(delete);
            }

            await _context.SaveChangesAsync();
        }

        public async Task<GetListPagingResponse<ModelStandardSetGetListPaging>> GetList(StandardSetGetListPagingRequest request)
        {
            var query = _context.StandardSets.AsQueryable().Where(x => !x.IsDeleted);

            if (!string.IsNullOrEmpty(request.TextSearch))
            {
                query = query.Where(x => x.Name.Contains(request.TextSearch) || x.Code.Contains(request.TextSearch));
            }

            if (request.IsActived.HasValue)
            {
                query = query.Where(x => x.IsActived == request.IsActived.Value);
            }

            if (request.EvaluationMode.HasValue)
            {
                query = query.Where(x => x.EvaluationMode == request.EvaluationMode.Value);
            }

            var totalRow = await query.CountAsync();

            var data = await query
                .OrderByDescending(x => x.UpdatedAt.HasValue ? x.UpdatedAt : x.CreatedAt)
                .Skip((request.PageIndex - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync();

            return new GetListPagingResponse<ModelStandardSetGetListPaging>
            {
                PageIndex = request.PageIndex,
                PageSize = request.PageSize,
                TotalRow = totalRow,
                Data = _mapper.Map<List<ModelStandardSetGetListPaging>>(data)
            };
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.StandardSets.Where(x => !x.IsDeleted && x.IsActived).ToListAsync();
            return data.Select(x => new ModelCombobox
            {
                Text = $"{x.Code} - {x.Name}",
                Value = x.Id.ToString()
            }).OrderBy(x => x.Text).ToList();
        }
    }
}
