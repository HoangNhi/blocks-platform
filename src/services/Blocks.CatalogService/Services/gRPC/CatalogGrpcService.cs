using Blocks.CatalogService.Protos;
using Blocks.CatalogService.Services.CoreFeature.FileType;
using Blocks.CatalogService.Services.CoreFeature.Stakeholder;
using Blocks.CatalogService.Services.CoreFeature.Standard;
using Blocks.CatalogService.Infrastructure.Data;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Blocks.CatalogService.Services.gRPC
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class CatalogGrpcService : CatalogProto.CatalogProtoBase
    {
        private readonly IStakeholderService _stakeholderService;
        private readonly IStandardService _standardService;
        private readonly IFileTypeService _fileTypeService;
        private readonly CatalogContext _context;

        public CatalogGrpcService(
            IStakeholderService stakeholderService,
            IStandardService standardService,
            IFileTypeService fileTypeService,
            CatalogContext context)
        {
            _stakeholderService = stakeholderService;
            _standardService = standardService;
            _fileTypeService = fileTypeService;
            _context = context;
        }

        #region Stakeholder Service
        public override async Task GetStakeholdersStream(
            GetStakeholdersStreamRequest request,
            IServerStreamWriter<StakeholderInfo> responseStream,
            ServerCallContext context)
        {
            await foreach (var item in _stakeholderService.GetStakeholdersStreamAsync(
                request,
                context.CancellationToken))
            {
                await responseStream.WriteAsync(item);
            }
        }
        #endregion

        #region Standard Service
        public override async Task GetCriterionsForEvidenceStream(
            GetCriterionsForEvidenceStreamRequest request,
            IServerStreamWriter<CriterionInfo> responseStream,
            ServerCallContext context)
        {
            await foreach (var item in _standardService.GetCriterionsForEvidenceStreamAsync(
                request,
                context.CancellationToken))
            {
                await responseStream.WriteAsync(item);
            }
        }

        public override async Task GetStandardsWithCriteriaStream(
            GetStandardsWithCriteriaStreamRequest request,
            IServerStreamWriter<StandardWithCriteriaInfo> responseStream,
            ServerCallContext context)
        {
            await foreach (var item in _standardService.GetStandardsWithCriteriaStreamAsync(
                request,
                context.CancellationToken))
            {
                await responseStream.WriteAsync(item);
            }
        }

        public override async Task GetFileTypesByCriterionStream(
            GetFileTypesByCriterionStreamRequest request,
            IServerStreamWriter<FileTypeInfo> responseStream,
            ServerCallContext context)
        {
            await foreach (var item in _standardService.GetFileTypesByCriterionStreamAsync(
                request,
                context.CancellationToken))
            {
                await responseStream.WriteAsync(item);
            }
        }
        #endregion

        #region FileType Service
        public override async Task GetFileTypesStream(
           GetFileTypesStreamRequest request,
           IServerStreamWriter<FileTypeInfo> responseStream,
           ServerCallContext context)
        {
            await foreach (var item in _fileTypeService.GetFileTypesStreamAsync(
                request,
                context.CancellationToken))
            {
                await responseStream.WriteAsync(item);
            }
        }
        #endregion

        #region StandardSet Service
        public override async Task<GetStandardSetEvaluationModeResponse> GetStandardSetEvaluationMode(
            GetStandardSetEvaluationModeRequest request,
            ServerCallContext context)
        {
            var id = Guid.Parse(request.StandardSetId);
            var standardSet = await _context.StandardSets
                .AsNoTracking()
                .Where(x => x.Id == id && !x.IsDeleted && x.IsActived)
                .Select(x => new { x.EvaluationMode, x.ChartType, x.Name })
                .FirstOrDefaultAsync(context.CancellationToken);

            return new GetStandardSetEvaluationModeResponse
            {
                EvaluationMode = standardSet?.EvaluationMode ?? 1,
                ChartType = standardSet?.ChartType ?? 0,
                Name = standardSet?.Name ?? string.Empty
            };
        }

        public override async Task GetRequirementsByStandardSetStream(
            GetRequirementsByStandardSetStreamRequest request,
            IServerStreamWriter<CriterionRequirementRow> responseStream,
            ServerCallContext context)
        {
            var standardSetId = Guid.Parse(request.StandardSetId);

            var requirements = await _context.CriterionRequirements
                .AsNoTracking()
                .Join(
                    _context.Criteria.AsNoTracking(),
                    cr => cr.CriterionId,
                    c => c.Id,
                    (cr, c) => new { cr, c }
                )
                .Join(
                    _context.Standards.AsNoTracking(),
                    x => x.c.StandardId,
                    s => s.Id,
                    (x, s) => new { x.cr, s }
                )
                .Where(x => x.s.StandardSetId == standardSetId && !x.cr.IsDeleted && x.cr.IsActived && !x.s.IsDeleted && x.s.IsActived)
                .Select(x => new CriterionRequirementRow
                {
                    CriterionId = x.cr.CriterionId.ToString(),
                    FileTypeId = x.cr.FileTypeId.ToString(),
                    MinQuantity = x.cr.MinQuantity,
                    IsMandatory = x.cr.IsMandatory
                })
                .ToListAsync(context.CancellationToken);

            foreach (var req in requirements)
            {
                await responseStream.WriteAsync(req);
            }
        }
        #endregion
    }
}
