using System.Net;
using Xunit;

namespace Blocks.AiVideoService.Tests;

public class AiVideoServiceHealthTests
{
    [Fact]
    public async Task Health_endpoint_is_available_in_development()
    {
        await using var factory = new AiVideoServiceFactory();
        using var response = await factory.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
