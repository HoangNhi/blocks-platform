using Blocks.FileService.Protos;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Common;
using Grpc.Net.Client.Web;
using Blocks.SystemService.DTOs.CoreFeature.User.Requests;
using Blocks.SystemService.Infrastructure.Data;
using Blocks.SystemService.Infrastructure.Security;
using Blocks.SystemService.Infrastructure.Validation;
using AutoDependencyRegistration;
using AutoMapper;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

namespace Blocks.SystemService.Configs
{
    public static class ConfigService
    {
        public static void ExecuteConfigService(this WebApplicationBuilder builder)
        {
            builder.WebHost.ConfigureKestrel(options =>
            {
                options.ConfigureEndpointDefaults(defaults =>
                {
                    defaults.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1AndHttp2;
                });
            });
            builder.Services.AddSingleton(builder.Configuration);
            builder.Services.AddOptions<RegistrationOptions>()
                .Bind(builder.Configuration.GetSection(RegistrationOptions.SectionName));
            var registrationOptions = builder.Configuration.GetSection(RegistrationOptions.SectionName).Get<RegistrationOptions>() ?? new RegistrationOptions();
            builder.Services.AddRateLimiter(options =>
            {
                options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
                options.AddPolicy(RegistrationOptions.RegistrationPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = registrationOptions.RegistrationPermitLimit,
                        Window = TimeSpan.FromMinutes(registrationOptions.RegistrationWindowMinutes),
                        QueueLimit = 0
                    }));
                options.AddPolicy(RegistrationOptions.BootstrapPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = registrationOptions.BootstrapPermitLimit,
                        Window = TimeSpan.FromMinutes(registrationOptions.BootstrapWindowMinutes),
                        QueueLimit = 0
                    }));
            });
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddOptions<JwtOptions>()
                .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
                .Validate(options => !string.IsNullOrWhiteSpace(options.Key), "Jwt:Key is required.")
                .Validate(options => !string.IsNullOrWhiteSpace(options.Issuer), "Jwt:Issuer is required.")
                .Validate(options => !string.IsNullOrWhiteSpace(options.Audience), "Jwt:Audience is required.")
                .Validate(options => options.Expiry > 0, "Jwt:Expiry must be greater than zero.")
                .Validate(options => options.ExpireRefreshToken > 0, "Jwt:ExpireRefreshToken must be greater than zero.")
                .ValidateOnStart();
            builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();

            builder.Services.AddScoped<Blocks.SystemService.Infrastructure.Services.IAuditLogWriter, Blocks.SystemService.Infrastructure.Services.AuditLogWriter>();
            builder.Services.AddScoped<ISystemReferenceGuard, SystemReferenceGuard>();
            builder.Services.AddScoped<Blocks.SystemService.Infrastructure.Filters.AuditActionFilter>();
            builder.Services.AddScoped<Blocks.SystemService.Infrastructure.Interceptors.AuditInterceptor>();

            builder.Services.AddDbContext<SystemContext>((sp, options) =>
                options.UseNpgsql(builder.Configuration.GetConnectionString("System"))
                       .AddInterceptors(sp.GetRequiredService<Blocks.SystemService.Infrastructure.Interceptors.AuditInterceptor>()));

            builder.Services.AddDbContextFactory<SystemContext>(options =>
                options.UseNpgsql(builder.Configuration.GetConnectionString("System")),
                ServiceLifetime.Scoped);
            builder.Services.AddHostedService<SystemMigrationHostedService>();

            builder.Services.AddAutoMapper(mc =>
            {
                mc.AddMaps(typeof(ConfigService).Assembly);
                mc.CreateMap<DateOnly?, DateTime?>().ConvertUsing(new DateTimeTypeConverter());
                mc.CreateMap<DateTime?, DateOnly?>().ConvertUsing(new DateOnlyTypeConverter());
            });

            builder.Services.Configure<ApiBehaviorOptions>(options =>
            {
                options.InvalidModelStateResponseFactory = context =>
                {
                    var errorMsg = CommonFunc.GetModelStateAPI(context.ModelState);
                    return new OkObjectResult(new BaseResponse(false, 400, errorMsg));
                };
            });
            builder.Services.AddMvc()
                .AddFluentValidation(config =>
                {
                    config.ImplicitlyValidateChildProperties = true;
                    config.DisableDataAnnotationsValidation = true;
                    config.RegisterValidatorsFromAssemblyContaining<UserRequestValidator>();
                })
                .AddJsonOptions(options =>
                {
                    options.JsonSerializerOptions.PropertyNamingPolicy = null;
                    options.JsonSerializerOptions.Converters.Add(new VietnamDateTimeConverter());
                    options.JsonSerializerOptions.Converters.Add(new VietnamNullableDateTimeConverter());
                });

            builder.Services.AutoRegisterDependencies();

            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(
                    policy =>
                    {
                        var origin = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
                        if (origin != null && origin.Length > 0)
                        {
                            policy.WithOrigins(origin)
                                  .AllowAnyHeader()
                                  .AllowAnyMethod();
                        }
                    });
            });

            builder.Services.AddGrpc();
            builder.Services.AddTransient<Blocks.Shared.Common.GrpcJwtInterceptor>();
            builder.Services.AddGrpcClient<FileProto.FileProtoClient>(o =>
            {
                o.Address = new Uri(builder.Configuration["GrpcClients:FileService"] ?? "http://FileService");
            })
            .ConfigureChannel(o =>
            {
                o.HttpVersion = new Version(1, 1);
                o.HttpVersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()))
            .AddInterceptor<Blocks.Shared.Common.GrpcJwtInterceptor>();
        }
    }

    public class DateTimeTypeConverter : ITypeConverter<DateOnly?, DateTime?>
    {
        public DateTime? Convert(DateOnly? source, DateTime? destination, ResolutionContext context)
        {
            return source.HasValue ? source.Value.ToDateTime(TimeOnly.Parse("00:00:00")) : null;
        }
    }

    public class DateOnlyTypeConverter : ITypeConverter<DateTime?, DateOnly?>
    {
        public DateOnly? Convert(DateTime? source, DateOnly? destination, ResolutionContext context)
        {
            return source.HasValue ? DateOnly.FromDateTime(source.Value) : null;
        }
    }
}
