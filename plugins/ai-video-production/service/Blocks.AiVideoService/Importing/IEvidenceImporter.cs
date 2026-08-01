using System;
using System.Threading;
using System.Threading.Tasks;

namespace Blocks.AiVideoService.Importing;

internal sealed record ImportOutcome(
    Guid ImportBatchId,
    int CreatedRuns,
    int CreatedArtifacts,
    int RejectedEvidence,
    bool Applied);

internal interface IEvidenceImporter
{
    Task<ImportOutcome> ImportAsync(ImportRequest request, CancellationToken cancellationToken);
}
