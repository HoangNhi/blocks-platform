using Blocks.FileService.Configs;
using Blocks.FileService.Authorization;
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
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient<SystemFunctionalAuthorizationClient>(client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["SystemService:BaseUrl"] ?? "http://systemservice",
        UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(2);
});
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

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/Files", StringComparison.OrdinalIgnoreCase)
        && HttpMethods.IsGet(context.Request.Method))
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var authorization = context.RequestServices.GetRequiredService<SystemFunctionalAuthorizationClient>();
        var result = await authorization.CheckAsync(
            "files.library",
            Blocks.Shared.Authorization.FunctionalPermissionAction.VIEW,
            context.RequestAborted);
        if (!result.AuthorityAvailable)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            return;
        }

        if (!result.Allowed)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }

    await next();
});
app.UseStaticFiles();
app.MapControllers();
app.UseGrpcWeb(new GrpcWebOptions { DefaultEnabled = true });
app.MapGrpcService<FileGrpcService>();

app.Run();
