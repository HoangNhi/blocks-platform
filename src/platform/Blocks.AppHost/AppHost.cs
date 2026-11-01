var builder = DistributedApplication.CreateBuilder(args);

var fileService = builder.AddProject<Projects.Blocks_FileService>("FileService");

var systemService = builder
    .AddProject<Projects.Blocks_SystemService>("SystemService")
    .WithReference(fileService);

fileService.WithReference(systemService);

var catalogService = builder.AddProject<Projects.Blocks_CatalogService>("CatalogService")
    .WithReference(systemService)
    .WithReference(fileService);

var knowledgeHub = builder.AddUvicornApp(
        "knowledgehubservice",
        "../../services/Blocks.KnowledgeHubService",
        "knowledgehub.main:app")
    .WithUv(args: ["sync", "--locked", "--python", "3.12.14", "--no-python-downloads"])
    .WithVirtualEnvironment(".venv", createIfNotExists: false)
    .WithEnvironment("KNOWLEDGEHUB_JWT_ISSUER", builder.AddParameter("knowledgehub-jwt-issuer"))
    .WithEnvironment("KNOWLEDGEHUB_JWT_AUDIENCE", builder.AddParameter("knowledgehub-jwt-audience"))
    .WithEnvironment("KNOWLEDGEHUB_SYSTEM_GRPC_URL", systemService.GetEndpoint("https"))
    .WithEnvironment("KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE", builder.AddParameter("knowledgehub-grpc-ca-file"))
    .WithEnvironment("KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS", "3.0");

var gateway = builder.AddProject<Projects.Blocks_ApiGateway>("ApiGateway")
    .WithReference(systemService)
    .WithReference(catalogService)
    .WithReference(fileService)
    .WithReference(knowledgeHub)
    .WithEnvironment("ReverseProxy__Clusters__knowledgehub-cluster__Destinations__destination1__Address", knowledgeHub.GetEndpoint("http"));

builder.AddJavaScriptApp("Web", "../../apps/Blocks.Web", "dev")
    .WithReference(gateway)
    .WithHttpEndpoint(env: "VITE_DEV_PORT", port: 5173)
    .WithExternalHttpEndpoints();

builder.Build().Run();
