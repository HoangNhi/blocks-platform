using Blocks.SystemService.Protos;
using AutoDependencyRegistration;
using Grpc.Net.Client.Web;

namespace Blocks.FileService.Configs
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
            builder.Services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
            builder.Services.AddSingleton<Blocks.FileService.Infrastructure.Storage.FileStorage>();

            // Audit action filter
            builder.Services.AddScoped<Blocks.FileService.Infrastructure.Filters.AuditActionFilter>();

            // gRPC client for audit logging
            builder.Services.AddGrpcClient<AuditProto.AuditProtoClient>(o =>
            {
                o.Address = new Uri(builder.Configuration["GrpcClients:SystemService"] ?? "http://SystemService");
            })
            .ConfigureChannel(o =>
            {
                o.HttpVersion = new Version(1, 1);
                o.HttpVersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()));

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
                                  .WithExposedHeaders("Content-Disposition", "X-Original-Content-Type", "X-Converted-Content-Type")
                                  .AllowAnyHeader()
                                  .AllowAnyMethod();
                        }
                    });
            });

            const int grpcMaxMessageSize = 128 * 1024 * 1024; // 128 MB
            builder.Services.AddGrpc(options =>
            {
                options.MaxReceiveMessageSize = grpcMaxMessageSize;
                options.MaxSendMessageSize = grpcMaxMessageSize;
            });
        }
    }
}
