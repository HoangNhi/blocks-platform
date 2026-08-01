FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Blocks.slnx .
COPY platform/shared/Blocks.Shared/ platform/shared/Blocks.Shared/
COPY platform/service-defaults/Blocks.ServiceDefaults/ platform/service-defaults/Blocks.ServiceDefaults/
COPY services/system-service/Blocks.SystemService/Protos/ services/system-service/Blocks.SystemService/Protos/
COPY services/file-service/Blocks.FileService/ services/file-service/Blocks.FileService/

RUN dotnet restore services/file-service/Blocks.FileService/Blocks.FileService.csproj
RUN dotnet publish services/file-service/Blocks.FileService/Blocks.FileService.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Blocks.FileService.dll"]
