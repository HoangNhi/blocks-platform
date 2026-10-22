using Blocks.Shared.DTOs.Base;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System.Text.Json;
using System.Text.RegularExpressions;
using Yarp.ReverseProxy.Model;

namespace Blocks.ApiGateway.Middlewares
{
    public class FileServiceBoundary
    {
        private static readonly Regex RasterFileNameRegex = new(
            @"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg|jpeg|webp)$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private readonly RequestDelegate _next;
        private readonly IConfiguration _configuration;

        public FileServiceBoundary(RequestDelegate next, IConfiguration configuration)
        {
            _next = next;
            _configuration = configuration;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                await _next(context);
                return;
            }

            var proxyFeature = context.GetReverseProxyFeature();
            var clusterId = proxyFeature.Cluster?.Config.ClusterId;
            var configuredFileClusterId = _configuration["FileProxy:ClusterId"];

            var isFileCluster = !string.IsNullOrEmpty(configuredFileClusterId) &&
                                string.Equals(clusterId, configuredFileClusterId, StringComparison.OrdinalIgnoreCase);

            var path = context.Request.Path.Value ?? string.Empty;
            var hasFilePrefix = path.StartsWith("/File/", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(path, "/File", StringComparison.OrdinalIgnoreCase);

            if (hasFilePrefix && !isFileCluster)
            {
                await BlockRequestAsync(context);
                return;
            }

            if (!isFileCluster)
            {
                await _next(context);
                return;
            }

            var routeTransforms = proxyFeature.Route?.Config.Transforms;
            if (routeTransforms != null)
            {
                foreach (var transform in routeTransforms)
                {
                    if (transform.TryGetValue("PathRemovePrefix", out var prefixVal))
                    {
                        if (!string.Equals(prefixVal, "/File", StringComparison.OrdinalIgnoreCase))
                        {
                            await BlockRequestAsync(context);
                            return;
                        }
                    }
                    else
                    {
                        await BlockRequestAsync(context);
                        return;
                    }
                }
            }

            var contentType = context.Request.ContentType ?? string.Empty;
            if (contentType.StartsWith("application/grpc", StringComparison.OrdinalIgnoreCase))
            {
                await BlockRequestAsync(context);
                return;
            }

            var normalizedPath = hasFilePrefix ? path["/File".Length..] : path;
            if (!normalizedPath.StartsWith('/'))
            {
                normalizedPath = "/" + normalizedPath;
            }

            var method = context.Request.Method;

            if (HttpMethods.IsPost(method) && string.Equals(normalizedPath, "/api/UploadFile", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            if (HttpMethods.IsPost(method) && string.Equals(normalizedPath, "/api/UploadFile/embed", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            if (HttpMethods.IsGet(method) && normalizedPath.StartsWith("/api/Avatar/", StringComparison.OrdinalIgnoreCase))
            {
                var fileName = normalizedPath["/api/Avatar/".Length..];
                if (RasterFileNameRegex.IsMatch(fileName))
                {
                    await _next(context);
                    return;
                }
            }

            await BlockRequestAsync(context);
        }

        private static async Task BlockRequestAsync(HttpContext context)
        {
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = "application/json";

            var response = new BaseResponse(false, 403, "Yêu cầu đến dịch vụ tệp tin không được phép");
            var json = JsonSerializer.Serialize(response);

            await context.Response.WriteAsync(json);
        }
    }
}
