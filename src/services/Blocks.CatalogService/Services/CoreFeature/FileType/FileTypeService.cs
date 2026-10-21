using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.CatalogService.DTOs.CoreFeature.FileType.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.FileType.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.CatalogService.Protos;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using System.Runtime.CompilerServices;

namespace Blocks.CatalogService.Services.CoreFeature.FileType
{
    [RegisterClassAsTransient]
    public class FileTypeService : IFileTypeService
    {
        private readonly CatalogContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;

        public FileTypeService(
            CatalogContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
        }

        #region CRUD
        public async Task<ModelFileType> GetById(GetByIdRequest request)
        {
            var data = await _context.FileTypes.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelFileType>(data);
        }

        public async Task Insert(FileTypeRequest request)
        {
            var data = _context.FileTypes.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên loại tệp đã tồn tại");
            }

            var add = _mapper.Map<Entities.FileType>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            add.CreatedAt = DateTime.UtcNow;

            await _context.FileTypes.AddAsync(add);
            await _context.SaveChangesAsync();
        }

        public async Task Update(FileTypeRequest request)
        {
            var data = _context.FileTypes.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên loại tệp đã tồn tại");
            }

            var update = await _context.FileTypes.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            update.UpdatedAt = DateTime.UtcNow;

            _context.FileTypes.Update(update);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.FileTypes.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name ?? "System";

                _context.FileTypes.Update(delete);
            }

            await _context.SaveChangesAsync();
        }

        public async Task<GetListPagingResponse<ModelFileType>> GetList(FileTypeGetListPagingRequest request)
        {
            var query = _context.FileTypes.AsQueryable().Where(x => !x.IsDeleted);

            if (!string.IsNullOrEmpty(request.TextSearch))
            {
                query = query.Where(x => x.Name.Contains(request.TextSearch) || x.Code.Contains(request.TextSearch));
            }

            if (request.IsActived.HasValue)
            {
                query = query.Where(x => x.IsActived == request.IsActived.Value);
            }

            var totalRow = await query.CountAsync();

            var data = await query
                .OrderByDescending(x => x.UpdatedAt.HasValue ? x.UpdatedAt : x.CreatedAt)
                .Skip((request.PageIndex - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync();

            return new GetListPagingResponse<ModelFileType>
            {
                PageIndex = request.PageIndex,
                PageSize = request.PageSize,
                TotalRow = totalRow,
                Data = _mapper.Map<List<ModelFileType>>(data)
            };
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.FileTypes.Where(x => !x.IsDeleted && x.IsActived == true).ToListAsync();
            return data.Select(x => new ModelCombobox
            {
                Text = x.Name,
                Value = x.Id.ToString()
            }).OrderBy(x => x.Text).ToList();
        }
        #endregion

        #region GRPC Services
        public async IAsyncEnumerable<FileTypeInfo> GetFileTypesStreamAsync(
            GetFileTypesStreamRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var query = _context.FileTypes.AsNoTracking();

            if (!string.IsNullOrEmpty(request.Id) && Guid.TryParse(request.Id, out Guid id))
            {
                query = query.Where(s => s.Id == Guid.Parse(request.Id));
            }

            var dataStream = query
                .Where(x => x.IsActived && !x.IsDeleted)
                .Select(s => new FileTypeInfo
                {
                    Id = s.Id.ToString(),
                    Code = s.Code,
                    Name = s.Name,
                    Description = s.Description
                })
                .AsAsyncEnumerable();

            await foreach (var item in dataStream.WithCancellation(cancellationToken))
            {
                yield return item;
            }
        }
        #endregion
    }
}
