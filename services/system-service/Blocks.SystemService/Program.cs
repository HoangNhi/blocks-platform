using Blocks.Shared.Common;
using Blocks.SystemService.Configs;
using Blocks.SystemService.Middlewares;
using Blocks.SystemService.Services.SystemGrpc;
using Grpc.AspNetCore.Web;
using Microsoft.AspNetCore.Server.Kestrel.Core;

// Allow writing DateTime with Kind=Utc to PostgreSQL 'timestamp without time zone' columns
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

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

// Add services to the container.

builder.Services.AddControllers(options =>
{
    options.Filters.AddService<Blocks.SystemService.Infrastructure.Filters.AuditActionFilter>();
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureEndpointDefaults(lo => lo.Protocols = HttpProtocols.Http1AndHttp2);
});

builder.ExecuteConfigService();
builder.ExecuteConfigAuthentication();
builder.Services.AddTrustedForwardedHeaders(forwardLimit: 2);

var app = builder.Build();

app.UseMiddleware<GlobalExceptionHandler>();
app.UseTrustedForwardedHeaders();

app.MapDefaultEndpoints();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (app.Environment.IsDevelopment() && !disableHttpsRedirection)
{
    app.UseHttpsRedirection();
}

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.UseGrpcWeb(new GrpcWebOptions { DefaultEnabled = true });
app.MapGrpcService<SystemGrpcService>();
app.MapGrpcService<Blocks.SystemService.Services.GrpcService.AuditGrpcService>();

app.Run();
