using AutoDependencyRegistration;

namespace Blocks.FileService.Configs
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
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();

            builder.Services.AutoRegisterDependencies();

            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                {
                    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
                    if (origins != null && origins.Length > 0)
                    {
                        policy.WithOrigins(origins)
                            .WithExposedHeaders("Content-Disposition")
                            .AllowAnyHeader()
                            .AllowAnyMethod();
                    }
                });
            });

            const int grpcMaxMessageSize = 128 * 1024 * 1024;
            builder.Services.AddGrpc(options =>
            {
                options.MaxReceiveMessageSize = grpcMaxMessageSize;
                options.MaxSendMessageSize = grpcMaxMessageSize;
            });
        }
    }
}
