using System.Net;
using Blocks.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

internal static class PlatformChecks
{
    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"Assertion failed: {message}");
        }
    }

    private static async Task ExecutePipelineAsync(HttpContext context, int forwardLimit)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddTrustedForwardedHeaders(forwardLimit: forwardLimit);
        using var sp = services.BuildServiceProvider();
        var app = new ApplicationBuilder(sp);
        app.UseTrustedForwardedHeaders();
        var pipeline = app.Build();
        await pipeline(context);
    }

    public static async Task RunAsync()
    {
        Console.WriteLine("Running PlatformChecks...");

        // 1. TFM and Runtime verification
        Assert(Environment.Version.Major == 10, "Runtime is .NET 10");

        // 2. Options and DI registration with forwardLimit = 1
        var services1 = new ServiceCollection();
        services1.AddTrustedForwardedHeaders(forwardLimit: 1);
        using (var sp1 = services1.BuildServiceProvider())
        {
            var options1 = sp1.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

            Assert(options1.ForwardedHeaders == (ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto),
                "ForwardedHeaders flags include XForwardedFor and XForwardedProto");
            Assert(options1.KnownIPNetworks.Count == 3, "Exactly 3 KnownIPNetworks registered");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "10.0.0.0" && n.PrefixLength == 8),
                "KnownIPNetworks contains 10.0.0.0/8");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "172.16.0.0" && n.PrefixLength == 12),
                "KnownIPNetworks contains 172.16.0.0/12");
            Assert(options1.KnownIPNetworks.Any(n => n.BaseAddress.ToString() == "192.168.0.0" && n.PrefixLength == 16),
                "KnownIPNetworks contains 192.168.0.0/16");

            Assert(options1.KnownProxies.Count == 2, "Exactly 2 KnownProxies registered");
            Assert(options1.KnownProxies.Contains(IPAddress.Loopback), "KnownProxies contains 127.0.0.1");
            Assert(options1.KnownProxies.Contains(IPAddress.IPv6Loopback), "KnownProxies contains ::1");
            Assert(options1.ForwardLimit == 1, "ForwardLimit defaults to 1");
        }

        // 3. Options and DI registration with forwardLimit = 2
        var services2 = new ServiceCollection();
        services2.AddTrustedForwardedHeaders(forwardLimit: 2);
        using (var sp2 = services2.BuildServiceProvider())
        {
            var options2 = sp2.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
            Assert(options2.ForwardLimit == 2, "ForwardLimit configured to 2");
        }

        // 4. Middleware execution: trusted remote proxy updates RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.195";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("203.0.113.195")),
                "Trusted loopback proxy updates RemoteIpAddress to forwarded client IP");
            Assert(context.Request.Scheme == "https", "Trusted loopback proxy updates Request.Scheme to https");
        }

        // 5. Middleware execution: trusted private network proxy updates RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("10.50.1.2");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.42";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.42")),
                "Trusted 10.0.0.0/8 network proxy updates RemoteIpAddress");
            Assert(context.Request.Scheme == "https", "Trusted 10.0.0.0/8 network proxy updates Scheme");
        }

        // 6. Middleware execution: untrusted remote proxy retains original RemoteIpAddress and Scheme
        {
            var context = new DefaultHttpContext();
            var untrustedIp = IPAddress.Parse("203.0.113.50");
            context.Connection.RemoteIpAddress = untrustedIp;
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "1.2.3.4";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(untrustedIp),
                "Untrusted remote IP does not update RemoteIpAddress");
            Assert(context.Request.Scheme == "http", "Untrusted remote IP does not update Scheme");
        }

        // 7. Middleware execution: IPv4-mapped IPv6 trusted proxy (::ffff:127.0.0.1)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("::ffff:127.0.0.1");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.77";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.77")),
                "IPv4-mapped IPv6 loopback is recognized as trusted proxy");
            Assert(context.Request.Scheme == "https", "Scheme updated for IPv4-mapped IPv6 loopback");
        }

        // 8. Middleware execution: IPv4-mapped IPv6 trusted network (::ffff:10.10.10.10)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("::ffff:10.10.10.10");
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.88";
            context.Request.Headers["X-Forwarded-Proto"] = "https";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("198.51.100.88")),
                "IPv4-mapped IPv6 in 10.0.0.0/8 is recognized as trusted proxy");
            Assert(context.Request.Scheme == "https", "Scheme updated for IPv4-mapped IPv6 private network");
        }

        // 9. Middleware execution: multi-hop with forwardLimit = 1 (stops after 1 hop)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 1);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("10.0.0.2")),
                "forwardLimit=1 stops after 1 hop, resulting in 10.0.0.2");
        }

        // 10. Middleware execution: multi-hop with forwardLimit = 2 (traverses trusted hop to client)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 2);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("203.0.113.1")),
                "forwardLimit=2 consumes trusted hop 10.0.0.2 and sets client IP 203.0.113.1");
        }

        // 11. Middleware execution: multi-hop does not exceed forwardLimit = 2 when 3 hops exist
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Parse("127.0.0.1");
            context.Request.Headers["X-Forwarded-For"] = "203.0.113.1, 192.168.1.1, 10.0.0.2";

            await ExecutePipelineAsync(context, forwardLimit: 2);

            Assert(context.Connection.RemoteIpAddress != null &&
                   context.Connection.RemoteIpAddress.Equals(IPAddress.Parse("192.168.1.1")),
                "forwardLimit=2 consumes exactly 2 hops (10.0.0.2 then 192.168.1.1) and stops");
        }

        Console.WriteLine("All PlatformChecks passed.");
    }
}
