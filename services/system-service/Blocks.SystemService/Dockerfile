FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Blocks.slnx .
COPY platform/shared/Blocks.Shared/ platform/shared/Blocks.Shared/
COPY platform/service-defaults/Blocks.ServiceDefaults/ platform/service-defaults/Blocks.ServiceDefaults/
COPY services/file-service/Blocks.FileService/Protos/ services/file-service/Blocks.FileService/Protos/
COPY services/system-service/Blocks.SystemService/ services/system-service/Blocks.SystemService/

RUN dotnet restore services/system-service/Blocks.SystemService/Blocks.SystemService.csproj
RUN dotnet publish services/system-service/Blocks.SystemService/Blocks.SystemService.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Blocks.SystemService.dll"]
