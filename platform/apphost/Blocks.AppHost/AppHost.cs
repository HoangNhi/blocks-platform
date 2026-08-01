using System;
using System.Collections.Generic;
using System.IO;

var builder = DistributedApplication.CreateBuilder(args);

static Dictionary<string, string> LoadDotEnv(string path)
{
    var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    if (!File.Exists(path))
    {
        return values;
    }

    foreach (var rawLine in File.ReadAllLines(path))
    {
        var line = rawLine.Trim();
        if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
        {
            continue;
        }

        var separatorIndex = line.IndexOf('=');
        if (separatorIndex <= 0)
        {
            continue;
        }

        var key = line[..separatorIndex].Trim();
        var value = line[(separatorIndex + 1)..].Trim();
        if (
            value.Length >= 2
            && value.StartsWith("\"", StringComparison.Ordinal)
            && value.EndsWith("\"", StringComparison.Ordinal)
        )
        {
            value = value[1..^1];
        }

        values[key] = value;
    }

    return values;
}

static string GetSetting(IReadOnlyDictionary<string, string> dotEnv, string key, string fallback)
{
    if (dotEnv.TryGetValue(key, out var dotEnvValue) && !string.IsNullOrWhiteSpace(dotEnvValue))
    {
        return dotEnvValue;
    }

    return Environment.GetEnvironmentVariable(key) ?? fallback;
}

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

var tradeLabDotEnv = LoadDotEnv(
    Path.GetFullPath(
        Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "..",
            "plugins",
            "tradelab",
            "service",
            ".env.local"
        )
    )
);
var tradeLabTestnetCredentialVaultProvider = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_TESTNET_CREDENTIAL_VAULT_PROVIDER",
    "fake"
);
var tradeLabLocalDevTestnetCredentialKey = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LOCAL_DEV_TESTNET_CREDENTIAL_KEY",
    ""
);
var tradeLabTestnetCredentialValidationEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_TESTNET_CREDENTIAL_VALIDATION_ENABLED",
    "false"
);
var tradeLabBinanceTestnetBaseUrl = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_BINANCE_TESTNET_BASE_URL",
    "https://testnet.binance.vision"
);
var tradeLabTestnetOrderSubmitConnectorMode = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_TESTNET_ORDER_SUBMIT_CONNECTOR_MODE",
    "fake"
);
var tradeLabTestnetOrderSubmitNetworkEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_TESTNET_ORDER_SUBMIT_NETWORK_ENABLED",
    "false"
);
var tradeLabTestnetOrderSubmitKillSwitchEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_TESTNET_ORDER_SUBMIT_KILL_SWITCH_ENABLED",
    "true"
);
var tradeLabLiveCredentialVaultProvider = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_CREDENTIAL_VAULT_PROVIDER",
    "disabled"
);
var tradeLabLocalDevLiveCredentialKey = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LOCAL_DEV_LIVE_CREDENTIAL_KEY",
    ""
);
var tradeLabLiveCredentialValidationEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_CREDENTIAL_VALIDATION_ENABLED",
    "false"
);
var tradeLabLiveCredentialValidationRecvWindowMs = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_CREDENTIAL_VALIDATION_RECV_WINDOW_MS",
    "5000"
);
var tradeLabLiveCredentialValidationTimeoutSeconds = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_CREDENTIAL_VALIDATION_TIMEOUT_SECONDS",
    "5.0"
);
var tradeLabBinanceLiveBaseUrl = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_BINANCE_LIVE_BASE_URL",
    "https://api.binance.com"
);
var tradeLabLiveOrderSubmitKillSwitchEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_ORDER_SUBMIT_KILL_SWITCH_ENABLED",
    "true"
);
var tradeLabLiveOrderSubmitConnectorMode = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_ORDER_SUBMIT_CONNECTOR_MODE",
    "fake"
);
var tradeLabLiveOrderSubmitNetworkEnabled = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_ORDER_SUBMIT_NETWORK_ENABLED",
    "false"
);
var tradeLabLiveOrderSubmitRecvWindowMs = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_ORDER_SUBMIT_RECV_WINDOW_MS",
    "5000"
);
var tradeLabLiveOrderSubmitTimeoutSeconds = GetSetting(
    tradeLabDotEnv,
    "TRADELAB_LIVE_ORDER_SUBMIT_TIMEOUT_SECONDS",
    "5.0"
);

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
    .WithUv(args: ["sync", "--python", "3.12"]);

if (appHostSmokeMode)
{
    tradeLabService.WithEnvironment("DATABASE_URL", smokeDatabaseUrl);
}
else
{
    var tradeLabDatabaseUrl = builder.AddParameter("tradelab-smoke-database-url", secret: true);
    tradeLabService.WithEnvironment("DATABASE_URL", tradeLabDatabaseUrl);
}

tradeLabService
    .WithEnvironment("SEED_BASELINE_ON_STARTUP", appHostSmokeMode ? "false" : "true")
    .WithEnvironment("SEED_BASELINE_CREATED_BY", "trade-lab-apphost")
    .WithEnvironment("TRADELAB_ENVIRONMENT", "local")
    .WithEnvironment("TRADELAB_LOCAL_FILL_ENABLED", appHostSmokeMode ? "false" : "true")
    .WithEnvironment("TRADELAB_LOCAL_PAPER_ENGINE_ENABLED", appHostSmokeMode ? "false" : "true")
    .WithEnvironment("TRADELAB_BACKGROUND_FILL_SCHEDULER_ENABLED", "false")
    .WithEnvironment("TRADELAB_PAPER_SCHEDULER_ENABLED", "false")
    .WithEnvironment(
        "TRADELAB_TESTNET_CREDENTIAL_VAULT_PROVIDER",
        appHostSmokeMode ? "fake" : tradeLabTestnetCredentialVaultProvider
    )
    .WithEnvironment(
        "TRADELAB_LOCAL_DEV_TESTNET_CREDENTIAL_KEY",
        appHostSmokeMode ? "" : tradeLabLocalDevTestnetCredentialKey
    )
    .WithEnvironment(
        "TRADELAB_TESTNET_CREDENTIAL_VALIDATION_ENABLED",
        appHostSmokeMode ? "false" : tradeLabTestnetCredentialValidationEnabled
    )
    .WithEnvironment(
        "TRADELAB_BINANCE_TESTNET_BASE_URL",
        appHostSmokeMode ? "http://127.0.0.1:9" : tradeLabBinanceTestnetBaseUrl
    )
    .WithEnvironment(
        "TRADELAB_TESTNET_ORDER_SUBMIT_CONNECTOR_MODE",
        appHostSmokeMode ? "fake" : tradeLabTestnetOrderSubmitConnectorMode
    )
    .WithEnvironment(
        "TRADELAB_TESTNET_ORDER_SUBMIT_NETWORK_ENABLED",
        appHostSmokeMode ? "false" : tradeLabTestnetOrderSubmitNetworkEnabled
    )
    .WithEnvironment(
        "TRADELAB_TESTNET_ORDER_SUBMIT_KILL_SWITCH_ENABLED",
        appHostSmokeMode ? "true" : tradeLabTestnetOrderSubmitKillSwitchEnabled
    )
    .WithEnvironment(
        "TRADELAB_LIVE_CREDENTIAL_VAULT_PROVIDER",
        appHostSmokeMode ? "disabled" : tradeLabLiveCredentialVaultProvider
    )
    .WithEnvironment(
        "TRADELAB_LOCAL_DEV_LIVE_CREDENTIAL_KEY",
        appHostSmokeMode ? "" : tradeLabLocalDevLiveCredentialKey
    )
    .WithEnvironment(
        "TRADELAB_LIVE_CREDENTIAL_VALIDATION_ENABLED",
        appHostSmokeMode ? "false" : tradeLabLiveCredentialValidationEnabled
    )
    .WithEnvironment(
        "TRADELAB_LIVE_CREDENTIAL_VALIDATION_RECV_WINDOW_MS",
        tradeLabLiveCredentialValidationRecvWindowMs
    )
    .WithEnvironment(
        "TRADELAB_LIVE_CREDENTIAL_VALIDATION_TIMEOUT_SECONDS",
        tradeLabLiveCredentialValidationTimeoutSeconds
    )
    .WithEnvironment(
        "TRADELAB_BINANCE_LIVE_BASE_URL",
        appHostSmokeMode ? "http://127.0.0.1:9" : tradeLabBinanceLiveBaseUrl
    )
    .WithEnvironment(
        "TRADELAB_LIVE_ORDER_SUBMIT_KILL_SWITCH_ENABLED",
        appHostSmokeMode ? "true" : tradeLabLiveOrderSubmitKillSwitchEnabled
    )
    .WithEnvironment(
        "TRADELAB_LIVE_ORDER_SUBMIT_CONNECTOR_MODE",
        appHostSmokeMode ? "fake" : tradeLabLiveOrderSubmitConnectorMode
    )
    .WithEnvironment(
        "TRADELAB_LIVE_ORDER_SUBMIT_NETWORK_ENABLED",
        appHostSmokeMode ? "false" : tradeLabLiveOrderSubmitNetworkEnabled
    )
    .WithEnvironment(
        "TRADELAB_LIVE_ORDER_SUBMIT_RECV_WINDOW_MS",
        tradeLabLiveOrderSubmitRecvWindowMs
    )
    .WithEnvironment(
        "TRADELAB_LIVE_ORDER_SUBMIT_TIMEOUT_SECONDS",
        tradeLabLiveOrderSubmitTimeoutSeconds
    )
    .WithHttpHealthCheck("/health");

var assistantLlmModel =
    Environment.GetEnvironmentVariable("ASSISTANT_LLM_MODEL") ?? "qwen3.5:2b-q4_K_M";
var assistantService = builder
    .AddUvicornApp(
        "assistantservice",
        "../../../services/assistant-service",
        "assistant_service_api.main:app"
    )
    .WithUv(args: ["sync", "--python", "3.12"])
    .WithEnvironment("ASSISTANT_LLM_PROVIDER", appHostSmokeMode ? "disabled" : "ollama")
    .WithEnvironment("ASSISTANT_LLM_MODEL", assistantLlmModel)
    .WithEnvironment(
        "ASSISTANT_LLM_BASE_URL",
        appHostSmokeMode ? "http://127.0.0.1:9" : "http://localhost:11434"
    )
    .WithEnvironment("ASSISTANT_LLM_CONTEXT_TOKENS", "4096")
    .WithEnvironment("ASSISTANT_LLM_TIMEOUT_SECONDS", "60")
    .WithHttpHealthCheck("/health");

if (appHostSmokeMode)
{
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
else
{
    var aiVideoDatabaseUrl = builder.AddParameter("ai-video-database-url", secret: true);
    aiVideoService.WithEnvironment("ConnectionStrings__AiVideo", aiVideoDatabaseUrl);
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
