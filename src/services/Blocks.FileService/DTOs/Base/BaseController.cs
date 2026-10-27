using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Blocks.FileService.DTOs.Base
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class BaseController<T> : ControllerBase
    {
        [NonAction]
        public string GetClientIpAddress()
        {
            if (HttpContext == null)
                return null;

            var forwardedFor = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrEmpty(forwardedFor))
            {
                var ip = forwardedFor.Split(',').FirstOrDefault()?.Trim();
                if (IPAddress.TryParse(ip, out var realIp))
                    return realIp.MapToIPv4().ToString();
            }

            var realIpHeader = HttpContext.Request.Headers["X-Real-IP"].FirstOrDefault();
            if (!string.IsNullOrEmpty(realIpHeader) && IPAddress.TryParse(realIpHeader, out var realIp2))
            {
                return realIp2.MapToIPv4().ToString();
            }

            var remoteIp = HttpContext.Connection.RemoteIpAddress;
            if (remoteIp != null)
                return remoteIp.MapToIPv4().ToString();

            return null;
        }
    }
}
