using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;

namespace Blocks.CatalogService.Services.CoreFeature.Faculty
{
    [RegisterClassAsTransient]
    public class FacultyService : IFacultyService
    {
        private readonly CatalogContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;

        public FacultyService(
            CatalogContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
        }

        public async Task<ModelFaculty> GetById(GetByIdRequest request)
        {
            var data = await _context.Faculties.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelFaculty>(data);
        }

        public async Task<ModelFaculty> Insert(FacultyRequest request)
        {
            var data = _context.Faculties.Where(x =>
                x.Name == request.Name
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Tên phòng ban đã tồn tại");
            }

            var add = _mapper.Map<Entities.Faculty>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            add.CreatedAt = DateTime.UtcNow;

            await _context.Faculties.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelFaculty>(add);
        }

        public async Task<ModelFaculty> Update(FacultyRequest request)
        {
            var data = _context.Faculties.Where(x =>
                x.Name == request.Name
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Tên phòng ban đã tồn tại");
            }

            var update = await _context.Faculties.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";
            update.UpdatedAt = DateTime.UtcNow;

            _context.Faculties.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelFaculty>(update);
        }

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Faculties.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";

                _context.Faculties.Update(delete);
            }

            await _context.SaveChangesAsync();
            return String.Join(',', request.Ids);
        }

        public async Task<GetListPagingResponse<ModelFaculty>> GetList(GetListPagingRequest request)
        {
            var query = _context.Faculties.AsQueryable().Where(x => !x.IsDeleted);

            if (!string.IsNullOrEmpty(request.TextSearch))
            {
                query = query.Where(x => x.Name.Contains(request.TextSearch));
            }

            var totalRow = await query.CountAsync();

            var data = await query
                .OrderByDescending(x => x.UpdatedAt.HasValue ? x.UpdatedAt : x.CreatedAt)
                .Skip((request.PageIndex - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync();

            return new GetListPagingResponse<ModelFaculty>
            {
                PageIndex = request.PageIndex,
                PageSize = request.PageSize,
                TotalRow = totalRow,
                Data = _mapper.Map<List<ModelFaculty>>(data)
            };
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.Faculties.Where(x => !x.IsDeleted && x.IsActived == true).ToListAsync();
            return data.Select(x => new ModelCombobox
            {
                Text = x.Name,
                Value = x.Id.ToString()
            }).OrderBy(x => x.Text).ToList();
        }
    }
}
