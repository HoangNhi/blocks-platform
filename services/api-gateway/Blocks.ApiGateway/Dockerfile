FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Blocks.slnx .
COPY platform/service-defaults/Blocks.ServiceDefaults/ platform/service-defaults/Blocks.ServiceDefaults/
COPY services/api-gateway/Blocks.ApiGateway/ services/api-gateway/Blocks.ApiGateway/

RUN dotnet restore services/api-gateway/Blocks.ApiGateway/Blocks.ApiGateway.csproj
RUN dotnet publish services/api-gateway/Blocks.ApiGateway/Blocks.ApiGateway.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Blocks.ApiGateway.dll"]
