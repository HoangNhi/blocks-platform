using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Blocks.AiVideoService.Tests;

public class AiVideoMigrationTests
{
    private class MissingConnectionFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((context, configBuilder) =>
            {
                configBuilder.AddInMemoryCollection(new[]
                {
                    new KeyValuePair<string, string?>("ConnectionStrings:AiVideo", null)
                });
            });
        }
    }

    [Fact]
    public void Missing_connection_string_fails_startup_with_actionable_error()
    {
        using var factory = new MissingConnectionFactory();
        var ex = Assert.Throws<InvalidOperationException>(() => factory.Server);
        Assert.Contains("Connection string 'AiVideo' not found in configuration under ConnectionStrings:AiVideo.", ex.Message);
    }
}
