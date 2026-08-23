using Blocks.Shared.DTOs.Base;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Text;

namespace Blocks.SystemService.Configs
{
    public static class ConfigureAuthentication
    {
        private const string ServiceAuthorizationHeader = "x-service-authorization";

        private static bool IsGrpcRequest(HttpContext httpContext)
        {
            return httpContext.Request.ContentType?.StartsWith("application/grpc", StringComparison.OrdinalIgnoreCase) == true;
        }

        private static string? ExtractTokenFromHeader(string authHeader)
        {
            if (string.IsNullOrWhiteSpace(authHeader))
            {
                return null;
            }

            const string bearerPrefix = "Bearer ";
            return authHeader.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
                ? authHeader.Substring(bearerPrefix.Length).Trim()
                : authHeader.Trim();
        }

        private static bool IsFunctionalAuthorizationCheck(HttpContext httpContext)
        {
            return httpContext.Request.Path.Equals("/api/Authorization/check", StringComparison.OrdinalIgnoreCase);
        }

        public static void ExecuteConfigAuthentication(this WebApplicationBuilder builder)
        {
            var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
                ?? throw new InvalidOperationException("Jwt configuration is missing.");

            builder.Services
                .AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
                })
                .AddJwtBearer(options =>
                {
                    options.MapInboundClaims = false;
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateIssuerSigningKey = true,
                        ValidIssuer = jwtOptions.Issuer,
                        ValidAudience = jwtOptions.Audience,
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
                        NameClaimType = JwtRegisteredClaimNames.UniqueName,
                        ClockSkew = TimeSpan.Zero
                    };

                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            if (IsGrpcRequest(context.HttpContext)
                                && string.IsNullOrEmpty(context.Token)
                                && context.HttpContext.Request.Headers.TryGetValue(ServiceAuthorizationHeader, out var authHeader))
                            {
                                context.Token = ExtractTokenFromHeader(authHeader.ToString());
                            }

                            return Task.CompletedTask;
                        },

                         OnChallenge = async context =>
                         {
                             if (IsGrpcRequest(context.HttpContext))
                             {
                                 return;
                             }

                             if (IsFunctionalAuthorizationCheck(context.HttpContext))
                             {
                                 context.HandleResponse();
                                 context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                                 return;
                             }

                             context.HandleResponse();

                            context.Response.StatusCode = StatusCodes.Status200OK;
                            context.Response.ContentType = "application/json";

                            var response = new BaseResponse(false, 401, "Xác thực không thành công: token không hợp lệ hoặc bị thiếu");
                            var json = JsonConvert.SerializeObject(response);

                            await context.Response.WriteAsync(json);
                        },

                        OnForbidden = async context =>
                        {
                            if (IsGrpcRequest(context.HttpContext))
                            {
                                return;
                            }

                            context.Response.StatusCode = StatusCodes.Status200OK;
                            context.Response.ContentType = "application/json";

                            var response = new BaseResponse(false, 403, "Bạn không có quyền truy cập");
                            var json = JsonConvert.SerializeObject(response);

                            await context.Response.WriteAsync(json);
                        }
                    };
                });
        }
    }
}
