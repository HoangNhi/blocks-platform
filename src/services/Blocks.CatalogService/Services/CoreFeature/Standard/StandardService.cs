using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Criterion.Requests;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.CriterionRequirement.Requests;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Dtos;
using Blocks.CatalogService.DTOs.CoreFeature.Standard.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.CatalogService.Protos;
using AutoDependencyRegistration.Attributes;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using System.Runtime.CompilerServices;

namespace Blocks.CatalogService.Services.CoreFeature.Standard
{
    [RegisterClassAsTransient]
    public class StandardService : IStandardService
    {
        private readonly CatalogContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _contextAccessor;

        public StandardService(
            CatalogContext context,
            IMapper mapper,
            IHttpContextAccessor contextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _contextAccessor = contextAccessor;
        }

        public async Task<StandardRequest> GetById(GetByIdRequest request)
        {
            var data = await _context.Standards.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.Id);
            if (data == null)
            {
                throw new BusinessException("Không tìm thấy dữ liệu");
            }

            var result = _mapper.Map<StandardRequest>(data);
            var criteria = await _context.Criteria
                .AsNoTracking()
                .Where(x => x.StandardId == data.Id && !x.IsDeleted)
                .OrderBy(x => x.Order)
                .ToListAsync();

            result.Criterions = _mapper.Map<List<CriterionRequest>>(criteria);

            var criterionIds = criteria.Select(c => c.Id).ToList();
            var allOptions = await _context.CriterionRequirements
                .AsNoTracking()
                .Where(x => criterionIds.Contains(x.CriterionId) && !x.IsDeleted)
                .ToListAsync();

            foreach (var criterion in result.Criterions)
            {
                var options = allOptions.Where(x => x.CriterionId == criterion.Id).ToList();
                criterion.CriterionRequirements = _mapper.Map<List<CriterionRequirementRequest>>(options);
            }

            return result;
        }

        public async Task Insert(StandardRequest request)
        {
            var data = _context.Standards.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && x.StandardSetId == request.StandardSetId
                && !x.IsDeleted
            );

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên tiêu chuẩn đã tồn tại");
            }

            var add = _mapper.Map<Entities.Standard>(request);
            add.Id = request.Id == Guid.Empty ? Guid.NewGuid() : request.Id;
            add.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            add.CreatedAt = DateTime.UtcNow;

            #region Criterions
            if (!request.Criterions.Any())
            {
                throw new BusinessException("Tiêu chí không được để trống");
            }

            foreach (var criterion in request.Criterions)
            {
                var addCriterion = _mapper.Map<Entities.Criterion>(criterion);
                addCriterion.Id = criterion.Id == Guid.Empty ? Guid.NewGuid() : criterion.Id;
                addCriterion.StandardId = add.Id;
                addCriterion.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                addCriterion.CreatedAt = DateTime.UtcNow;
                await _context.Criteria.AddAsync(addCriterion);

                // Criterion Requirements
                foreach (var option in criterion.CriterionRequirements)
                {
                    var addOption = _mapper.Map<Entities.CriterionRequirement>(option);
                    addOption.Id = option.Id == Guid.Empty ? Guid.NewGuid() : option.Id;
                    addOption.CriterionId = addCriterion.Id;
                    addOption.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                    addOption.CreatedAt = DateTime.UtcNow;
                    await _context.CriterionRequirements.AddAsync(addOption);
                }
            }
            #endregion

            await _context.Standards.AddAsync(add);
            await _context.SaveChangesAsync();
        }

        public async Task Update(StandardRequest request)
        {
            var data = _context.Standards.Where(x =>
                (x.Code == request.Code || x.Name == request.Name)
                && x.StandardSetId == request.StandardSetId
                && !x.IsDeleted && x.Id != request.Id);

            if (data.Any())
            {
                throw new BusinessException("Mã hoặc tên tiêu chuẩn đã tồn tại");
            }

            var update = await _context.Standards.FindAsync(request.Id);
            if (update == null)
            {
                throw new BusinessException("Dữ liệu không tồn tại");
            }

            _mapper.Map(request, update);

            update.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
            update.UpdatedAt = DateTime.UtcNow;

            #region Criterions
            var existingCriterions = _context.Criteria
                .Where(x => x.StandardId == update.Id && !x.IsDeleted)
                .ToList();
            // Mark removed criterions as deleted
            foreach (var existing in existingCriterions)
            {
                if (!request.Criterions.Any(x => x.Id == existing.Id))
                {
                    existing.IsDeleted = true;
                    existing.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                    existing.UpdatedAt = DateTime.UtcNow;
                    _context.Criteria.Update(existing);
                }
            }
            // Add or update criterions
            foreach (var criterion in request.Criterions)
            {
                var existingCriterion = existingCriterions
                    .FirstOrDefault(x => x.Id == criterion.Id);
                if (existingCriterion != null)
                {
                    // Update existing
                    _mapper.Map(criterion, existingCriterion);
                    existingCriterion.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                    existingCriterion.UpdatedAt = DateTime.UtcNow;
                    _context.Criteria.Update(existingCriterion);

                    #region CriterionRequirements for existing Criterion
                    // Get existing CriterionRequirements for this Criterion
                    var existingRequirements = _context.CriterionRequirements
                        .Where(r => r.CriterionId == existingCriterion.Id && !r.IsDeleted)
                        .ToList();

                    // Mark removed CriterionRequirements as deleted
                    var requestRequirementIds = criterion.CriterionRequirements.Select(r => r.Id).ToList();
                    var removedRequirements = existingRequirements
                        .Where(r => !requestRequirementIds.Contains(r.Id));

                    foreach (var removed in removedRequirements)
                    {
                        removed.IsDeleted = true;
                        removed.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                        removed.UpdatedAt = DateTime.UtcNow;
                        _context.CriterionRequirements.Update(removed);
                    }

                    // Process each CriterionRequirement in the request
                    foreach (var requirementRequest in criterion.CriterionRequirements)
                    {
                        var existingRequirement = existingRequirements
                            .FirstOrDefault(r => r.Id == requirementRequest.Id);

                        if (existingRequirement != null)
                        {
                            // Update existing CriterionRequirement
                            _mapper.Map(requirementRequest, existingRequirement);
                            existingRequirement.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                            existingRequirement.UpdatedAt = DateTime.UtcNow;
                            _context.CriterionRequirements.Update(existingRequirement);
                        }
                        else
                        {
                            // Add new CriterionRequirement
                            var addRequirement = _mapper.Map<Entities.CriterionRequirement>(requirementRequest);
                            addRequirement.Id = requirementRequest.Id == Guid.Empty ? Guid.NewGuid() : requirementRequest.Id;
                            addRequirement.CriterionId = existingCriterion.Id;
                            addRequirement.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                            addRequirement.CreatedAt = DateTime.UtcNow;
                            await _context.CriterionRequirements.AddAsync(addRequirement);
                        }
                    }
                    #endregion
                }
                else
                {
                    // Add new
                    var addCriterion = _mapper.Map<Entities.Criterion>(criterion);
                    addCriterion.Id = criterion.Id == Guid.Empty ? Guid.NewGuid() : criterion.Id;
                    addCriterion.StandardId = update.Id;
                    addCriterion.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                    addCriterion.CreatedAt = DateTime.UtcNow;
                    await _context.Criteria.AddAsync(addCriterion);

                    #region CriterionRequirements for new Criterion
                    // Add all CriterionRequirements for the new Criterion
                    foreach (var requirementRequest in criterion.CriterionRequirements)
                    {
                        var addRequirement = _mapper.Map<Entities.CriterionRequirement>(requirementRequest);
                        addRequirement.Id = requirementRequest.Id == Guid.Empty ? Guid.NewGuid() : requirementRequest.Id;
                        addRequirement.CriterionId = addCriterion.Id;
                        addRequirement.CreatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                        addRequirement.CreatedAt = DateTime.UtcNow;
                        await _context.CriterionRequirements.AddAsync(addRequirement);
                    }
                    #endregion
                }
            }
            #endregion

            _context.Standards.Update(update);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteList(DeleteListRequest request)
        {
            foreach (var id in request.Ids)
            {
                var delete = await _context.Standards.FindAsync(id);
                if (delete == null)
                {
                    throw new BusinessException("Dữ liệu không tồn tại");
                }

                delete.IsDeleted = true;
                delete.UpdatedBy = _contextAccessor.HttpContext.User.Identity.Name;
                delete.UpdatedAt = DateTime.UtcNow;

                _context.Standards.Update(delete);
            }

            await _context.SaveChangesAsync();
        }

        public async Task<GetListPagingResponse<ModelStandardGetListPaging>> GetList(StandardGetListPagingRequest request)
        {
            var query = from s in _context.Standards.Where(x => !x.IsDeleted)
                        join ss in _context.StandardSets.Where(x => !x.IsDeleted && x.IsActived)
                        on s.StandardSetId equals ss.Id
                        select new { Standard = s, StandardSetName = ss.Name };

            if (!string.IsNullOrEmpty(request.TextSearch))
            {
                query = query.Where(x => x.Standard.Name.Contains(request.TextSearch)
                    || x.Standard.Code.Contains(request.TextSearch)
                    || (x.Standard.Description != null && x.Standard.Description.Contains(request.TextSearch)));
            }

            if (request.StandardSetId.HasValue && request.StandardSetId.Value != Guid.Empty)
            {
                query = query.Where(x => x.Standard.StandardSetId == request.StandardSetId.Value);
            }

            if (request.IsActived.HasValue)
            {
                query = query.Where(x => x.Standard.IsActived == request.IsActived.Value);
            }

            var totalRow = await query.CountAsync();

            var data = await query
                .OrderByDescending(x => x.Standard.UpdatedAt.HasValue ? x.Standard.UpdatedAt : x.Standard.CreatedAt)
                .Skip((request.PageIndex - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync();

            var result = data.Select(x => new ModelStandardGetListPaging
            {
                Id = x.Standard.Id,
                StandardSetId = x.Standard.StandardSetId,
                Code = x.Standard.Code,
                Name = x.Standard.Name,
                Description = x.Standard.Description,
                Order = x.Standard.Order,
                IsActived = x.Standard.IsActived,
                CreatedAt = x.Standard.CreatedAt,
                CreatedBy = x.Standard.CreatedBy,
                UpdatedAt = x.Standard.UpdatedAt,
                UpdatedBy = x.Standard.UpdatedBy,
                StandardSet = x.StandardSetName
            }).ToList();

            return new GetListPagingResponse<ModelStandardGetListPaging>
            {
                PageIndex = request.PageIndex,
                PageSize = request.PageSize,
                TotalRow = totalRow,
                Data = result
            };
        }

        public async Task<List<ModelCombobox>> GetAllForCombobox()
        {
            var data = await _context.Standards.Where(x => !x.IsDeleted && x.IsActived == true).ToListAsync();
            return data.Select(x => new ModelCombobox
            {
                Text = $"{x.Code} - {x.Name}",
                Value = x.Id.ToString()
            }).OrderBy(x => x.Text).ToList();
        }

        public async Task<List<StandardRequest>> GetListWithCriteria(GetListStandardWithCriteriaRequest request)
        {
            if (!request.StandardSetId.HasValue || request.StandardSetId.Value == Guid.Empty)
            {
                throw new BusinessException("Bộ tiêu chuẩn không được để trống");
            }

            var standardSet = await _context.StandardSets
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == request.StandardSetId.Value && !x.IsDeleted && x.IsActived);
            if (standardSet == null)
            {
                throw new BusinessException("Bộ tiêu chuẩn không tồn tại");
            }

            Guid targetStandardSetId = standardSet.Id;

            var standards = await _context.Standards
                .AsNoTracking()
                .Where(x => x.StandardSetId == targetStandardSetId && !x.IsDeleted && x.IsActived)
                .OrderBy(x => x.Order)
                .ToListAsync();

            if (!standards.Any())
            {
                return new List<StandardRequest>();
            }

            var standardIds = standards.Select(x => x.Id).ToList();

            var criteria = await _context.Criteria
                .AsNoTracking()
                .Where(x => standardIds.Contains(x.StandardId) && !x.IsDeleted && x.IsActived)
                .OrderBy(x => x.Order)
                .ToListAsync();

            if (!criteria.Any())
            {
                return _mapper.Map<List<StandardRequest>>(standards);
            }

            var criterionIds = criteria.Select(x => x.Id).ToList();

            var hasFileTypeFilter = request.FileTypeId.HasValue && request.FileTypeId.Value != Guid.Empty;

            var requirementsQuery = _context.CriterionRequirements
                .AsNoTracking()
                .Where(x => criterionIds.Contains(x.CriterionId) && !x.IsDeleted && x.IsActived);

            if (hasFileTypeFilter)
            {
                requirementsQuery = requirementsQuery.Where(x => x.FileTypeId == request.FileTypeId.Value);
            }

            var requirements = await requirementsQuery.ToListAsync();

            var requirementsByCriterion = requirements
                .GroupBy(x => x.CriterionId)
                .ToDictionary(x => x.Key, x => x.ToList());

            var result = _mapper.Map<List<StandardRequest>>(standards);

            foreach (var standard in result)
            {
                var standardCriteria = hasFileTypeFilter
                    ? criteria.Where(x => x.StandardId == standard.Id && requirementsByCriterion.ContainsKey(x.Id)).ToList()
                    : criteria.Where(x => x.StandardId == standard.Id).ToList();

                var mappedCriteria = _mapper.Map<List<CriterionRequest>>(standardCriteria);

                foreach (var criterion in mappedCriteria)
                {
                    if (requirementsByCriterion.TryGetValue(criterion.Id, out var criterionRequirements))
                    {
                        criterion.CriterionRequirements = _mapper.Map<List<CriterionRequirementRequest>>(criterionRequirements);
                    }
                }

                standard.Criterions = mappedCriteria;
            }

            return hasFileTypeFilter
                ? result.Where(x => x.Criterions.Any()).ToList()
                : result;
        }

        public async Task<List<ModelStandard>> GetByStandardSetId(Guid standardSetId)
        {
            return await _context.Standards
                .Where(x => x.StandardSetId == standardSetId && x.IsActived && !x.IsDeleted)
                .OrderBy(x => x.Order)
                .Select(x => new ModelStandard { Id = x.Id, StandardSetId = x.StandardSetId, Code = x.Code, Name = x.Name, Order = x.Order })
                .ToListAsync();
        }

        #region GRPC Services
        public async IAsyncEnumerable<CriterionInfo> GetCriterionsForEvidenceStreamAsync(
            GetCriterionsForEvidenceStreamRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            // Parse GUIDs from request
            if (!Guid.TryParse(request.StandardSetId, out var standardSetId))
                yield break;

            if (!Guid.TryParse(request.FileTypeId, out var fileTypeId))
                yield break;

            // Query with joins: StandardSet → Standard → Criterion → CriterionRequirement
            var query = from criterion in _context.Criteria
                        join standard in _context.Standards on criterion.StandardId equals standard.Id
                        join requirement in _context.CriterionRequirements on criterion.Id equals requirement.CriterionId
                        where standard.StandardSetId == standardSetId
                          && requirement.FileTypeId == fileTypeId
                          && !criterion.IsDeleted && criterion.IsActived
                          && !standard.IsDeleted && standard.IsActived
                          && !requirement.IsDeleted && requirement.IsActived
                        select criterion;

            // Stream results with distinct and ordering
            var dataStream = query
                .Distinct()
                .OrderBy(x => x.Order)
                .AsAsyncEnumerable();

            await foreach (var criterion in dataStream.WithCancellation(cancellationToken))
            {
                yield return new CriterionInfo
                {
                    Id = criterion.Id.ToString(),
                    StandardId = criterion.StandardId.ToString(),
                    Code = criterion.Code,
                    Name = criterion.Name,
                    IsPrerequisite = criterion.IsPrerequisite,
                    DiagnosticQuestions = criterion.DiagnosticQuestions ?? string.Empty,
                    Description = criterion.Description ?? string.Empty,
                    Order = criterion.Order
                };
            }
        }

        public async IAsyncEnumerable<StandardWithCriteriaInfo> GetStandardsWithCriteriaStreamAsync(
            GetStandardsWithCriteriaStreamRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            if (!Guid.TryParse(request.StandardSetId, out var standardSetId))
                yield break;

            // Query: Standard → Criterion, filtered by StandardSetId
            var query = from standard in _context.Standards
                        join criterion in _context.Criteria on standard.Id equals criterion.StandardId
                        where standard.StandardSetId == standardSetId
                          && !standard.IsDeleted
                          && !criterion.IsDeleted && criterion.IsActived
                        orderby standard.Order, criterion.Order
                        select new { standard, criterion };

            var dataStream = query.AsAsyncEnumerable();

            await foreach (var item in dataStream.WithCancellation(cancellationToken))
            {
                yield return new StandardWithCriteriaInfo
                {
                    StandardId = item.standard.Id.ToString(),
                    StandardCode = item.standard.Code,
                    StandardName = item.standard.Name,
                    StandardOrder = item.standard.Order,
                    CriterionId = item.criterion.Id.ToString(),
                    CriterionCode = item.criterion.Code,
                    CriterionName = item.criterion.Name,
                    IsPrerequisite = item.criterion.IsPrerequisite,
                    CriterionOrder = item.criterion.Order
                };
            }
        }

        public async IAsyncEnumerable<FileTypeInfo> GetFileTypesByCriterionStreamAsync(
            GetFileTypesByCriterionStreamRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            if (!Guid.TryParse(request.CriterionId, out var criterionId))
                yield break;

            var requirements = await _context.CriterionRequirements
                .AsNoTracking()
                .Where(x => x.CriterionId == criterionId && !x.IsDeleted && x.IsActived)
                .ToListAsync(cancellationToken);

            foreach (var req in requirements)
            {
                yield return new FileTypeInfo { Id = req.FileTypeId.ToString() };
            }
        }
        #endregion
    }
}
