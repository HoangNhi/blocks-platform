using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Blocks.FileService.Tests;

internal sealed class FileServiceFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Issuer"] = "blocks-tests",
                ["Jwt:Audience"] = "blocks-tests",
                ["Jwt:Key"] = "blocks-file-service-tests-signing-key-32-bytes"
            });
        });
    }
}
