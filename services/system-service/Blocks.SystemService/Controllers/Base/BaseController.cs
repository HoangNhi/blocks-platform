using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Blocks.SystemService.Controllers.Base
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class BaseController<T> : ControllerBase
    {
        [NonAction]
        public string? GetClientIpAddress()
        {
            if (HttpContext == null)
                return null;

            var forwardedFor = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrEmpty(forwardedFor))
            {
                var ip = forwardedFor.Split(',').FirstOrDefault()?.Trim();
                if (IPAddress.TryParse(ip, out var realIp))
                {
                    if (realIp.IsIPv4MappedToIPv6) return realIp.MapToIPv4().ToString();
                    if (IPAddress.IsLoopback(realIp)) return "127.0.0.1";
                    return realIp.ToString();
                }
            }

            var realIpHeader = HttpContext.Request.Headers["X-Real-IP"].FirstOrDefault();
            if (!string.IsNullOrEmpty(realIpHeader) && IPAddress.TryParse(realIpHeader, out var realIp2))
            {
                if (realIp2.IsIPv4MappedToIPv6) return realIp2.MapToIPv4().ToString();
                if (IPAddress.IsLoopback(realIp2)) return "127.0.0.1";
                return realIp2.ToString();
            }

            var remoteIp = HttpContext.Connection.RemoteIpAddress;
            if (remoteIp != null)
            {
                if (remoteIp.IsIPv4MappedToIPv6) return remoteIp.MapToIPv4().ToString();
                if (IPAddress.IsLoopback(remoteIp)) return "127.0.0.1";
                return remoteIp.ToString();
            }

            return null;
        }
    }
}
