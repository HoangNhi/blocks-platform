using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Stakeholder.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.CatalogService.Protos;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using System.Runtime.CompilerServices;

namespace Blocks.CatalogService.Services.CoreFeature.Stakeholder
{
    [RegisterClassAsTransient]
    public class StakeholderService : IStakeholderService
    {
        private readonly CatalogContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;

        public StakeholderService(
            CatalogContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
        }

        #region Chức năng chính
        public async Task<GetListPagingResponse<ModelStakeholderGetListPaging>> GetList(StakeholderGetListPagingRequest request)
        {
            var query = _context.Stakeholders.AsQueryable().Where(x => !x.IsDeleted);

            if (!string.IsNullOrEmpty(request.TextSearch))
            {
                query = query.Where(x => x.FullName.Contains(request.TextSearch.Trim()) || x.Email.Contains(request.TextSearch.Trim()));
            }

            if (request.Type.HasValue)
            {
                query = query.Where(x => x.Type == request.Type.Value);
            }

            var totalRow = await query.CountAsync();

            var data = await query
                .OrderByDescending(x => x.UpdatedAt.HasValue ? x.UpdatedAt : x.CreatedAt)
                .Skip((request.PageIndex - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync();

            var result = data.Select(x =>
            {
                var res = _mapper.Map<ModelStakeholderGetListPaging>(x);
                res.TypeName = x.Type switch
                {
                    1 => "Sinh viên",
                    2 => "Cựu sinh viên",
                    3 => "Nhà tuyển dụng",
                    4 => "Giảng viên",
                    _ => "Khác"
                };
                return res;
            }).ToList();

            return new GetListPagingResponse<ModelStakeholderGetListPaging>
            {
                PageIndex = request.PageIndex,
                PageSize = request.PageSize,
                TotalRow = totalRow,
                Data = result
            };
        }

        public async Task<ModelStakeholder> GetById(GetByIdRequest request)
        {
            var data = await _context.Stakeholders.FindAsync(request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            return _mapper.Map<ModelStakeholder>(data);
        }

        public async Task<ModelStakeholder> Insert(StakeholderRequest request)
        {
            var data = _context.Stakeholders.Where(x =>
                x.Email == request.Email
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Email đã tồn tại");
            }

            var add = _mapper.Map<Entities.Stakeholder>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            add.CreatedAt = DateTime.UtcNow;

            await _context.Stakeholders.AddAsync(add);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelStakeholder>(add);
        }

        public async Task<ModelStakeholder> Update(StakeholderRequest request)
        {
            var data = _context.Stakeholders.Where(x =>
                x.Email == request.Email
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Email đã tồn tại");
            }

            var update = await _context.Stakeholders.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            update.UpdatedAt = DateTime.UtcNow;

            _context.Stakeholders.Update(update);
            await _context.SaveChangesAsync();

            return _mapper.Map<ModelStakeholder>(update);
        }

        public async Task<string> DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Stakeholders.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedAt = DateTime.UtcNow;
                delete.UpdatedBy = _contextAccessor.HttpContext?.User?.Identity?.Name;

                _context.Stakeholders.Update(delete);
            }

            await _context.SaveChangesAsync();
            return String.Join(',', request.Ids);
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.Stakeholders.Where(x => !x.IsDeleted && x.IsActived == true).ToListAsync();
            return data.Select(x => new ModelCombobox
            {
                Text = x.FullName,
                Value = x.Id.ToString()
            }).OrderBy(x => x.Text).ToList();
        }
        #endregion

        #region GRPC Services
        public async IAsyncEnumerable<StakeholderInfo> GetStakeholdersStreamAsync(
            GetStakeholdersStreamRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var query = _context.Stakeholders.AsNoTracking();

            if (request.StakeholderType.HasValue)
            {
                query = query.Where(s => s.Type == request.StakeholderType.Value);
            }

            if (!string.IsNullOrEmpty(request.Id) && Guid.TryParse(request.Id, out Guid id))
            {
                query = query.Where(s => s.Id == id);
            }

            var dataStream = query
                .Where(x => x.IsActived && !x.IsDeleted)
                .Select(s => new StakeholderInfo
                {
                    Id = s.Id.ToString(),
                    FullName = s.FullName,
                    Email = s.Email,
                    Type = s.Type,
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
