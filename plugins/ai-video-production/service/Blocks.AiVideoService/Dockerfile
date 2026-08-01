FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Blocks.slnx .
COPY platform/shared/Blocks.Shared/ platform/shared/Blocks.Shared/
COPY platform/service-defaults/Blocks.ServiceDefaults/ platform/service-defaults/Blocks.ServiceDefaults/
COPY plugins/ai-video-production/service/Blocks.AiVideoService/ plugins/ai-video-production/service/Blocks.AiVideoService/

RUN dotnet restore plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj
RUN dotnet publish plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
CMD ["sh", "-c", "dotnet Blocks.AiVideoService.dll --urls http://0.0.0.0:${PORT:-8080}"]
