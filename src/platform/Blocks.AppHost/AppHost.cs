var builder = DistributedApplication.CreateBuilder(args);

var fileService = builder.AddProject<Projects.Blocks_FileService>("FileService");

var systemService = builder
    .AddProject<Projects.Blocks_SystemService>("SystemService")
    .WithReference(fileService);

fileService.WithReference(systemService);

var catalogService = builder.AddProject<Projects.Blocks_CatalogService>("CatalogService")
    .WithReference(systemService)
    .WithReference(fileService);

builder.AddNpmApp("CollabService", "../../services/Blocks.CollabService", "dev")
    .WithHttpEndpoint(env: "PORT", port: 1234)
    .WithExternalHttpEndpoints();

var businessService = builder.AddProject<Projects.Blocks_BusinessService>("BusinessService")
    .WithReference(systemService)
    .WithReference(fileService)
    .WithReference(catalogService);

systemService.WithReference(businessService);

var gateway = builder.AddProject<Projects.Blocks_ApiGateway>("ApiGateway")
    .WithReference(systemService)
    .WithReference(catalogService)
    .WithReference(businessService)
    .WithReference(fileService);

builder.AddNpmApp("Web", "../../apps/Blocks.Web", "dev")
    .WithReference(gateway)
    .WithHttpEndpoint(env: "VITE_DEV_PORT", port: 5173)
    .WithExternalHttpEndpoints();


builder.Build().Run();
