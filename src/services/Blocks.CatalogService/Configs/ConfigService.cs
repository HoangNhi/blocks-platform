using System.Data.Common;
using MySql.Data.MySqlClient;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Common;
using Grpc.Net.Client.Web;
using Blocks.CatalogService.DTOs.CoreFeature.Faculty.Requests;
using Blocks.CatalogService.Infrastructure.Data;
using Blocks.SystemService.Protos;
using AutoDependencyRegistration;
using AutoMapper;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blocks.CatalogService.Configs
{
    public static class ConfigService
    {
        public static void ExecuteConfigService(this WebApplicationBuilder builder)
        {
            //SYSTEM
            builder.WebHost.ConfigureKestrel(options =>
            {
                options.ConfigureEndpointDefaults(defaults =>
                {
                    defaults.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1AndHttp2;
                });
            });
            builder.Services.AddSingleton(builder.Configuration);
            builder.Services.AddHttpContextAccessor();

            // Audit interceptor + action filter
            builder.Services.AddScoped<Blocks.CatalogService.Infrastructure.Interceptors.AuditInterceptor>();
            builder.Services.AddScoped<Blocks.CatalogService.Infrastructure.Filters.AuditActionFilter>();

            //DATABASE
            var catalogConnStr = ValidateConnectionString(builder.Configuration.GetConnectionString("Catalog"));
            builder.Services.AddDbContext<CatalogContext>((sp, options) =>
                options.UseMySQL(catalogConnStr)
                       .AddInterceptors(sp.GetRequiredService<Blocks.CatalogService.Infrastructure.Interceptors.AuditInterceptor>()));

            //MAPPER
            builder.Services.AddAutoMapper(mc =>
            {
                mc.AddMaps(typeof(ConfigService).Assembly);
                mc.CreateMap<DateOnly?, DateTime?>().ConvertUsing(new DateTimeTypeConverter());
                mc.CreateMap<DateTime?, DateOnly?>().ConvertUsing(new DateOnlyTypeConverter());
            });

            //FLUENT
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
                    config.RegisterValidatorsFromAssemblyContaining<FacultyRequestValidator>();
                })
                .AddJsonOptions(options =>
                {
                    options.JsonSerializerOptions.PropertyNamingPolicy = null;
                    options.JsonSerializerOptions.Converters.Add(new VietnamDateTimeConverter());
                    options.JsonSerializerOptions.Converters.Add(new VietnamNullableDateTimeConverter());
                });

            //ALL SERVICE
            builder.Services.AutoRegisterDependencies();

            //CORS
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

            // gRPC
            builder.Services.AddTransient<Blocks.Shared.Common.GrpcJwtInterceptor>();
            builder.Services.AddGrpcClient<SystemProto.SystemProtoClient>(o =>
            {
                o.Address = new Uri(builder.Configuration["GrpcClients:SystemService"] ?? "http://SystemService");
            })
            .ConfigureChannel(o =>
            {
                o.HttpVersion = new Version(1, 1);
                o.HttpVersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()))
            .AddInterceptor<Blocks.Shared.Common.GrpcJwtInterceptor>();

            builder.Services.AddGrpcClient<AuditProto.AuditProtoClient>(o =>
            {
                o.Address = new Uri(builder.Configuration["GrpcClients:SystemService"] ?? "http://SystemService");
            })
            .ConfigureChannel(o =>
            {
                o.HttpVersion = new Version(1, 1);
                o.HttpVersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()))
            .AddInterceptor<Blocks.Shared.Common.GrpcJwtInterceptor>();
        }
        public static string ValidateConnectionString(string? connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException("ConnectionStrings:Catalog must not be empty");
            }

            DbConnectionStringBuilder supplied;
            try
            {
                supplied = new DbConnectionStringBuilder { ConnectionString = connectionString };
            }
            catch (ArgumentException)
            {
                throw new InvalidOperationException("Connection string format is invalid");
            }

            var supported = new MySqlConnectionStringBuilder();
            foreach (string keyword in supplied.Keys)
            {
                if (!supported.ContainsKey(keyword))
                    throw new InvalidOperationException($"Unsupported connection option: '{keyword}'");
            }

            try
            {
                _ = new MySqlConnectionStringBuilder(connectionString);
            }
            catch (Exception ex) when (ex is ArgumentException or FormatException or OverflowException)
            {
                // Driver value errors can include credentials; do not retain the original exception.
                throw new InvalidOperationException("Connection string contains an invalid value or format");
            }
            return connectionString;
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
