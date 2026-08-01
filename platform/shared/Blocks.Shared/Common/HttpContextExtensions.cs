using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;

namespace Blocks.Shared.Common;

public static class HttpContextExtensions
{
    public static string GetClientIp(this HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var forwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            var firstIp = forwardedFor.Split(',')[0].Trim();
            if (IPAddress.TryParse(firstIp, out var fwdIp))
            {
                if (fwdIp.IsIPv4MappedToIPv6)
                {
                    return fwdIp.MapToIPv4().ToString();
                }

                if (fwdIp.Equals(IPAddress.IPv6Loopback))
                {
                    return IPAddress.Loopback.ToString();
                }

                return fwdIp.ToString();
            }
        }

        var xRealIp = context.Request.Headers["X-Real-IP"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(xRealIp) && IPAddress.TryParse(xRealIp, out var realIp))
        {
            if (realIp.IsIPv4MappedToIPv6)
            {
                return realIp.MapToIPv4().ToString();
            }

            if (realIp.Equals(IPAddress.IPv6Loopback))
            {
                return IPAddress.Loopback.ToString();
            }

            return realIp.ToString();
        }

        var remoteIp = context.Connection.RemoteIpAddress;
        if (remoteIp is null)
        {
            return "unknown";
        }

        if (remoteIp.IsIPv4MappedToIPv6)
        {
            return remoteIp.MapToIPv4().ToString();
        }

        if (remoteIp.Equals(IPAddress.IPv6Loopback))
        {
            return IPAddress.Loopback.ToString();
        }

        return remoteIp.ToString();
    }

    public static void AddTrustedForwardedHeaders(this IServiceCollection services, int forwardLimit = 1)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();

            options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse("10.0.0.0"), 8));
            options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse("172.16.0.0"), 12));
            options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse("192.168.0.0"), 16));

            options.KnownProxies.Add(IPAddress.Loopback);
            options.KnownProxies.Add(IPAddress.IPv6Loopback);

            options.ForwardLimit = forwardLimit;
        });
    }

    public static void UseTrustedForwardedHeaders(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);
        app.UseForwardedHeaders();
    }
}
