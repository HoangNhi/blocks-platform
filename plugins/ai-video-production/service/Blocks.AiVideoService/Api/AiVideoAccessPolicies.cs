using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Blocks.AiVideoService.Api;

public static class AiVideoAccessPolicies
{
    public const string View = "AiVideoView";

    public static IServiceCollection AddAiVideoAccess(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtKey = configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            throw new InvalidOperationException("Jwt:Key is required for AI Video read API authentication.");
        }

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = configuration["Jwt:Issuer"],
                    ValidAudience = configuration["Jwt:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                    ClockSkew = TimeSpan.Zero
                };
                options.Events = new JwtBearerEvents
                {
                    OnChallenge = context =>
                    {
                        context.HandleResponse();
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return context.Response.WriteAsJsonAsync(
                            AiVideoResponses.Fail<object>("Authentication token is required.", "UNAUTHORIZED"));
                    },
                    OnForbidden = context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return context.Response.WriteAsJsonAsync(
                            AiVideoResponses.Fail<object>("AI Video Production view permission is required.", "FORBIDDEN"));
                    }
                };
            });

        services.AddAuthorization(options =>
        {
            options.AddPolicy(View, policy =>
            {
                policy.RequireAuthenticatedUser();
            });
        });

        services.AddHttpContextAccessor();
        services.AddHttpClient<SystemFunctionalAuthorizationClient>(client =>
        {
            client.BaseAddress = new Uri(
                configuration["SystemService:BaseUrl"] ?? "http://systemservice",
                UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(2);
        });

        return services;
    }
}
