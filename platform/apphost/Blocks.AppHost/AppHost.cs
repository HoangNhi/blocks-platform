using System;

var builder = DistributedApplication.CreateBuilder(args);

static string GetRequiredEnvironmentVariable(string key)
{
    var value = Environment.GetEnvironmentVariable(key);
    if (string.IsNullOrWhiteSpace(value))
    {
        throw new InvalidOperationException($"{key} is required when BLOCKS_APPHOST_SMOKE=true.");
    }

    return value;
}

var appHostSmokeMode = string.Equals(
    Environment.GetEnvironmentVariable("BLOCKS_APPHOST_SMOKE"),
    "true",
    StringComparison.OrdinalIgnoreCase
);
var smokeDatabaseUrl = appHostSmokeMode
    ? GetRequiredEnvironmentVariable("BLOCKS_SMOKE_DATABASE_URL")
    : "";
var smokeDotNetConnectionString = appHostSmokeMode
    ? GetRequiredEnvironmentVariable("BLOCKS_SMOKE_DOTNET_CONNECTION_STRING")
    : "";
var smokeJwtKey = appHostSmokeMode
    ? GetRequiredEnvironmentVariable("BLOCKS_SMOKE_SYSTEM_JWT_KEY")
    : "";
var smokeWebPort = appHostSmokeMode
    ? int.Parse(GetRequiredEnvironmentVariable("BLOCKS_SMOKE_WEB_PORT"))
    : 0;

var fileService = builder
    .AddProject<Projects.Blocks_FileService>("fileservice")
    .WithEnvironment("DISABLE_HTTPS_REDIRECTION", "true")
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
    fileService
        .WithEnvironment("Jwt__Key", smokeJwtKey)
        .WithEnvironment("Jwt__Issuer", "BlocksSmoke")
        .WithEnvironment("Jwt__Audience", "BlocksSmoke");
}

var systemService = builder
    .AddProject<Projects.Blocks_SystemService>("systemservice")
    .WithReference(fileService)
    .WaitFor(fileService)
    .WithEnvironment("DISABLE_HTTPS_REDIRECTION", "true")
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
    systemService
        .WithEnvironment("ConnectionStrings__System", smokeDotNetConnectionString)
        .WithEnvironment("Jwt__Key", smokeJwtKey)
        .WithEnvironment("Jwt__Issuer", "BlocksSmoke")
        .WithEnvironment("Jwt__Audience", "BlocksSmoke")
        .WithEnvironment("Jwt__Expiry", "1")
        .WithEnvironment("Jwt__ExpireRefreshToken", "1");
}

var tradeLabService = builder
    .AddUvicornApp("tradelabservice", "../../../plugins/tradelab/service", "tradelab_api.main:app")
    .WithUv(args: ["sync", "--python", "3.12"])
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
    tradeLabService
        .WithEnvironment("DATABASE_URL", smokeDatabaseUrl)
        .WithEnvironment("SEED_BASELINE_ON_STARTUP", "false")
        .WithEnvironment("SEED_BASELINE_CREATED_BY", "trade-lab-apphost")
        .WithEnvironment("TRADELAB_ENVIRONMENT", "local")
        .WithEnvironment("TRADELAB_LOCAL_FILL_ENABLED", "false")
        .WithEnvironment("TRADELAB_LOCAL_PAPER_ENGINE_ENABLED", "false")
        .WithEnvironment("TRADELAB_BACKGROUND_FILL_SCHEDULER_ENABLED", "false")
        .WithEnvironment("TRADELAB_PAPER_SCHEDULER_ENABLED", "false")
        .WithEnvironment("TRADELAB_TESTNET_CREDENTIAL_VAULT_PROVIDER", "fake")
        .WithEnvironment("TRADELAB_LOCAL_DEV_TESTNET_CREDENTIAL_KEY", "")
        .WithEnvironment("TRADELAB_TESTNET_CREDENTIAL_VALIDATION_ENABLED", "false")
        .WithEnvironment("TRADELAB_BINANCE_TESTNET_BASE_URL", "http://127.0.0.1:9")
        .WithEnvironment("TRADELAB_TESTNET_ORDER_SUBMIT_CONNECTOR_MODE", "fake")
        .WithEnvironment("TRADELAB_TESTNET_ORDER_SUBMIT_NETWORK_ENABLED", "false")
        .WithEnvironment("TRADELAB_TESTNET_ORDER_SUBMIT_KILL_SWITCH_ENABLED", "true")
        .WithEnvironment("TRADELAB_LIVE_CREDENTIAL_VAULT_PROVIDER", "disabled")
        .WithEnvironment("TRADELAB_LOCAL_DEV_LIVE_CREDENTIAL_KEY", "")
        .WithEnvironment("TRADELAB_LIVE_CREDENTIAL_VALIDATION_ENABLED", "false")
        .WithEnvironment("TRADELAB_LIVE_CREDENTIAL_VALIDATION_RECV_WINDOW_MS", "5000")
        .WithEnvironment("TRADELAB_LIVE_CREDENTIAL_VALIDATION_TIMEOUT_SECONDS", "5.0")
        .WithEnvironment("TRADELAB_BINANCE_LIVE_BASE_URL", "http://127.0.0.1:9")
        .WithEnvironment("TRADELAB_LIVE_ORDER_SUBMIT_KILL_SWITCH_ENABLED", "true")
        .WithEnvironment("TRADELAB_LIVE_ORDER_SUBMIT_CONNECTOR_MODE", "fake")
        .WithEnvironment("TRADELAB_LIVE_ORDER_SUBMIT_NETWORK_ENABLED", "false")
        .WithEnvironment("TRADELAB_LIVE_ORDER_SUBMIT_RECV_WINDOW_MS", "5000")
        .WithEnvironment("TRADELAB_LIVE_ORDER_SUBMIT_TIMEOUT_SECONDS", "5.0");
}

var assistantService = builder
    .AddUvicornApp(
        "assistantservice",
        "../../../services/assistant-service",
        "assistant_service_api.main:app"
    )
    .WithUv(args: ["sync", "--python", "3.12"])
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
    assistantService
        .WithEnvironment("ASSISTANT_LLM_PROVIDER", "disabled")
        .WithEnvironment("ASSISTANT_LLM_MODEL", "qwen3.5:2b-q4_K_M")
        .WithEnvironment("ASSISTANT_LLM_BASE_URL", "http://127.0.0.1:9")
        .WithEnvironment("ASSISTANT_LLM_CONTEXT_TOKENS", "4096")
        .WithEnvironment("ASSISTANT_LLM_TIMEOUT_SECONDS", "60");

#pragma warning disable ASPIRECERTIFICATES001
    tradeLabService.WithoutHttpsCertificate();
    assistantService.WithoutHttpsCertificate();
#pragma warning restore ASPIRECERTIFICATES001
}

var aiVideoService = builder
    .AddProject<Projects.Blocks_AiVideoService>("aivideoservice")
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
    aiVideoService
        .WithEnvironment("ConnectionStrings__AiVideo", smokeDotNetConnectionString)
        .WithEnvironment("Jwt__Key", smokeJwtKey)
        .WithEnvironment("Jwt__Issuer", "BlocksSmoke")
        .WithEnvironment("Jwt__Audience", "BlocksSmoke");
}

var apiGateway = builder
    .AddProject<Projects.Blocks_ApiGateway>("apigateway")
    .WithReference(systemService)
    .WithReference(fileService)
    .WithReference(tradeLabService)
    .WithReference(assistantService)
    .WithReference(aiVideoService)
    .WaitFor(systemService)
    .WaitFor(fileService)
    .WaitFor(tradeLabService)
    .WaitFor(aiVideoService)
    .WithEnvironment(
        "ReverseProxy__Clusters__system-cluster__Destinations__systemservice__Address",
        systemService.GetEndpoint("http")
    )
    .WithEnvironment(
        "ReverseProxy__Clusters__files-cluster__Destinations__fileservice__Address",
        fileService.GetEndpoint("http")
    )
    .WithEnvironment(
        "ReverseProxy__Clusters__tradelab-cluster__Destinations__tradelabservice__Address",
        tradeLabService.GetEndpoint("http")
    )
    .WithEnvironment(
        "ReverseProxy__Clusters__assistant-cluster__Destinations__assistantservice__Address",
        assistantService.GetEndpoint("http")
    )
    .WithEnvironment(
        "ReverseProxy__Clusters__ai-video-cluster__Destinations__aivideoservice__Address",
        aiVideoService.GetEndpoint("http")
    )
    .WithHttpHealthCheck("/health", endpointName: "http");

var apiGatewayHttpEndpoint = apiGateway.GetEndpoint("http");

var web = builder
    .AddViteApp("web", "../../../apps/web/Blocks.Web")
    .WithEnvironment("VITE_API_BASE_URL", apiGatewayHttpEndpoint)
    .WithReference(apiGateway)
    .WaitFor(apiGateway);

if (appHostSmokeMode)
{
    web.WithEndpoint("http", endpoint => endpoint.Port = smokeWebPort);
}

builder.Build().Run();
