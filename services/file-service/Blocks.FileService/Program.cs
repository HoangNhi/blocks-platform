using Blocks.FileService.Configs;
using Blocks.FileService.Middlewares;
using Blocks.FileService.Services.Grpc;
using Blocks.Shared.Common;
using Grpc.AspNetCore.Web;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
var disableHttpsRedirection = string.Equals(
    Environment.GetEnvironmentVariable("DISABLE_HTTPS_REDIRECTION"),
    "true",
    StringComparison.OrdinalIgnoreCase);
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://+:{port}");
}

builder.AddServiceDefaults();

builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.ExecuteConfigService();
builder.ExecuteConfigAuthentication();
builder.Services.AddTrustedForwardedHeaders(forwardLimit: 2);

var app = builder.Build();

app.UseMiddleware<GlobalExceptionHandler>();
app.UseTrustedForwardedHeaders();

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    if (!disableHttpsRedirection)
    {
        app.UseHttpsRedirection();
    }
}

app.UseStaticFiles();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.UseGrpcWeb(new GrpcWebOptions { DefaultEnabled = true });
app.MapGrpcService<FileGrpcService>();

app.Run();
