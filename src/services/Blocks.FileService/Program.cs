using Blocks.FileService.Configs;
using Blocks.FileService.Middlewares;
using Blocks.FileService.Services.Grpc;
using Blocks.ServiceDefaults;
using Blocks.Shared.Common;
using Grpc.AspNetCore.Web;

namespace Blocks.FileService
{
    public static class FileServiceHost
    {
        public static WebApplication Build(string[] args)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                ApplicationName = typeof(FileServiceHost).Assembly.FullName
            });

            var port = Environment.GetEnvironmentVariable("PORT");
            if (!string.IsNullOrEmpty(port))
            {
                builder.WebHost.UseUrls($"http://+:{port}");
            }

            builder.AddServiceDefaults();

            builder.Services.AddControllers(options =>
            {
                options.Filters.AddService<Blocks.FileService.Infrastructure.Filters.AuditActionFilter>();
            }).AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.ExecuteConfigService();
            builder.ExecuteConfigAuthentication();
            builder.Services.AddTrustedForwardedHeaders(forwardLimit: 2);

            var app = builder.Build();

            // Eager validate storage root early before startup
            app.Services.GetRequiredService<Blocks.FileService.Infrastructure.Storage.FileStorage>();

            app.UseMiddleware<GlobalExceptionHandler>();
            app.UseTrustedForwardedHeaders();

            app.MapDefaultEndpoints();

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
                app.UseHttpsRedirection();
            }

            app.UseCors();

            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllers();
            app.UseGrpcWeb(new GrpcWebOptions { DefaultEnabled = true });
            app.MapGrpcService<FileGrpcService>();

            return app;
        }
    }

    internal class Program
    {
        private static void Main(string[] args)
        {
            FileServiceHost.Build(args).Run();
        }
    }
}
