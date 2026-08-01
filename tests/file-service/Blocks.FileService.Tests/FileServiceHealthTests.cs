using System.Net;
using Xunit;

namespace Blocks.FileService.Tests;

public sealed class FileServiceHealthTests
{
    [Fact]
    public async Task Health_endpoint_is_available_in_development()
    {
        await using var factory = new FileServiceFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
