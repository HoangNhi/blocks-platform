using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.AiVideoService.Tests;

public class AiVideoModelTests
{
    private readonly DbContextOptions<AiVideoDbContext> _options;

    public AiVideoModelTests()
    {
        _options = new DbContextOptionsBuilder<AiVideoDbContext>()
            .UseInMemoryDatabase(databaseName: "AiVideoTestDb")
            .Options;
    }

    [Fact]
    public void Model_configuration_enforces_required_fields_and_uniqueness()
    {
        using var context = new AiVideoDbContext(_options);
        var model = context.Model;

        // 1. Check Artifact Configuration
        var artifactType = model.FindEntityType(typeof(Artifact));
        Assert.NotNull(artifactType);
        
        var sourceKeyProp = artifactType.FindProperty(nameof(Artifact.SourceKey));
        var runIdProp = artifactType.FindProperty(nameof(Artifact.RunId));
        var locatorProp = artifactType.FindProperty(nameof(Artifact.Locator));
        var checksumProp = artifactType.FindProperty(nameof(Artifact.Checksum));
        
        Assert.False(sourceKeyProp!.IsNullable);
        Assert.False(runIdProp!.IsNullable);
        Assert.False(locatorProp!.IsNullable);
        Assert.False(checksumProp!.IsNullable);

        var artifactIndex = artifactType.GetIndexes()
            .FirstOrDefault(i => i.Properties.Select(p => p.Name).SequenceEqual(new[] { 
                nameof(Artifact.SourceKey), 
                nameof(Artifact.RunId), 
                nameof(Artifact.Locator), 
                nameof(Artifact.Checksum) 
            }));
        Assert.NotNull(artifactIndex);
        Assert.True(artifactIndex.IsUnique);

        // 2. Check Receipt Configuration
        var receiptType = model.FindEntityType(typeof(Receipt));
        Assert.NotNull(receiptType);
        
        var recSourceKeyProp = receiptType.FindProperty(nameof(Receipt.SourceKey));
        var recRunIdProp = receiptType.FindProperty(nameof(Receipt.RunId));
        var recLocatorProp = receiptType.FindProperty(nameof(Receipt.Locator));
        var recChecksumProp = receiptType.FindProperty(nameof(Receipt.Checksum));
        
        Assert.False(recSourceKeyProp!.IsNullable);
        Assert.False(recRunIdProp!.IsNullable);
        Assert.False(recLocatorProp!.IsNullable);
        Assert.False(recChecksumProp!.IsNullable);

        var receiptIndex = receiptType.GetIndexes()
            .FirstOrDefault(i => i.Properties.Select(p => p.Name).SequenceEqual(new[] { 
                nameof(Receipt.SourceKey), 
                nameof(Receipt.RunId), 
                nameof(Receipt.Locator), 
                nameof(Receipt.Checksum) 
            }));
        Assert.NotNull(receiptIndex);
        Assert.True(receiptIndex.IsUnique);
    }

    [Fact]
    public void Model_configuration_enforces_check_constraints()
    {
        using var context = new AiVideoDbContext(_options);
        var model = context.Model;
        // Access design time model for check constraints
        var designTimeModel = Microsoft.EntityFrameworkCore.Infrastructure.AccessorExtensions
            .GetService<Microsoft.EntityFrameworkCore.Metadata.IDesignTimeModel>(context).Model;

        var entitiesWithStageKey = new[]
        {
            designTimeModel.FindEntityType(typeof(StageAttempt)),
            designTimeModel.FindEntityType(typeof(Artifact)),
            designTimeModel.FindEntityType(typeof(Receipt)),
            designTimeModel.FindEntityType(typeof(ReconciliationEvent))
        };

        foreach (var entityType in entitiesWithStageKey)
        {
            Assert.NotNull(entityType);
            var constraints = entityType.GetCheckConstraints();
            var stageKeyConstraint = constraints.FirstOrDefault(c => c.Name.Contains("StageKey"));
            Assert.NotNull(stageKeyConstraint);
            Assert.Contains("stage_key", stageKeyConstraint.Sql);
            Assert.Contains("collect-news", stageKeyConstraint.Sql);
            Assert.Contains("qa-review-delivery", stageKeyConstraint.Sql);
        }
    }
}
