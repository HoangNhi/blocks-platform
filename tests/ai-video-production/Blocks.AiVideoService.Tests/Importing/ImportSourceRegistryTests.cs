using System;
using System.IO;
using Blocks.AiVideoService.Importing;
using Microsoft.Extensions.Options;
using Xunit;

namespace Blocks.AiVideoService.Tests.Importing;

public class ImportSourceRegistryTests
{
    [Fact]
    public void Resolve_with_null_or_empty_key_throws_ArgumentException()
    {
        var options = Options.Create(new ImportSourceOptions());
        var registry = new ImportSourceRegistry(options);

        Assert.Throws<ArgumentException>(() => registry.Resolve(null!));
        Assert.Throws<ArgumentException>(() => registry.Resolve(""));
        Assert.Throws<ArgumentException>(() => registry.Resolve("   "));
    }

    [Fact]
    public void Resolve_with_invalid_or_non_allowlisted_key_throws_ArgumentException()
    {
        var options = Options.Create(new ImportSourceOptions { Legacy = "C:\\", Tracer = "C:\\", Target = "C:\\" });
        var registry = new ImportSourceRegistry(options);

        Assert.Throws<ArgumentException>(() => registry.Resolve("unknown"));
        Assert.Throws<ArgumentException>(() => registry.Resolve("html-tracer")); // only 'legacy', 'tracer', 'target' allowed
    }

    [Fact]
    public void Resolve_with_path_traversal_key_throws_ArgumentException()
    {
        var options = Options.Create(new ImportSourceOptions { Legacy = "C:\\", Tracer = "C:\\", Target = "C:\\" });
        var registry = new ImportSourceRegistry(options);

        Assert.Throws<ArgumentException>(() => registry.Resolve("../legacy"));
        Assert.Throws<ArgumentException>(() => registry.Resolve("legacy\\.."));
    }

    [Fact]
    public void Resolve_when_directory_does_not_exist_throws_DirectoryNotFoundException()
    {
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
        var registry = new ImportSourceRegistry(options);

        Assert.Throws<DirectoryNotFoundException>(() => registry.Resolve("legacy"));
    }

    [Fact]
    public void Resolve_valid_key_returns_ImportSource()
    {
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);
        try
        {
            var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
            var registry = new ImportSourceRegistry(options);

            var source = registry.Resolve("legacy");
            Assert.Equal("legacy", source.SourceKey);
            Assert.Equal(Path.GetFullPath(tempPath), source.RootPath);
        }
        finally
        {
            if (Directory.Exists(tempPath))
            {
                Directory.Delete(tempPath, true);
            }
        }
    }
}
