import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROGRAMS = (
    "platform/apphost/Blocks.AppHost/AppHost.cs",
    "services/system-service/Blocks.SystemService/Program.cs",
    "services/file-service/Blocks.FileService/Program.cs",
    "services/api-gateway/Blocks.ApiGateway/Program.cs",
    "plugins/ai-video-production/service/Blocks.AiVideoService/Program.cs",
)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_local_configuration_contract() -> None:
    gitignore = read(".gitignore")
    assert "**/appsettings.Development.json" in gitignore
    assert "**/appsettings.Local.json" not in gitignore
    assert "appsettings.Production.json" not in gitignore
    for path in PROGRAMS:
        assert "appsettings.Local.json" not in read(path), path

    for path in (
        "platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj",
        "services/system-service/Blocks.SystemService/Blocks.SystemService.csproj",
        "services/file-service/Blocks.FileService/Blocks.FileService.csproj",
        "plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj",
    ):
        assert "<UserSecretsId>" not in read(path), path
    importer = read("plugins/ai-video-production/service/Blocks.AiVideoImporter/Program.cs")
    importer_project = read(
        "plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj"
    )
    assert "Host.CreateApplicationBuilder()" in importer
    assert "new ConfigurationBuilder()" not in importer
    assert "appsettings.Local.json" not in importer
    assert (
        'PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.1"'
        in importer_project
    )
    for path in (
        "services/assistant-service/src/assistant_service_api/core/config.py",
        "plugins/tradelab/service/src/tradelab_api/core/config.py",
    ):
        source = read(path)
        assert 'env_file=".env.local"' in source, path
        assert 'env_file_encoding="utf-8"' in source, path
    apphost = read("platform/apphost/Blocks.AppHost/AppHost.cs")
    for marker in ("LoadDotEnv", "GetSetting", "tradeLabDotEnv", "assistantDotEnv"):
        assert marker not in apphost
    assert '.WithEnvironment("DATABASE_URL", smokeDatabaseUrl)' in apphost
    assert '.WithEnvironment("ASSISTANT_LLM_PROVIDER", "disabled")' in apphost

    directory_build_props = read("Directory.Build.props")
    assert 'AfterTargets="ComputeFilesToPublish"' in directory_build_props
    assert "<ResolvedFileToPublish" in directory_build_props
    assert 'Remove="@(ResolvedFileToPublish)"' in directory_build_props
    assert "appsettings.Development.json" in directory_build_props

    root_dockerignore = read(".dockerignore")
    for pattern in (
        "**/appsettings.Development.json",
        "**/appsettings.Local.json",
        "**/.env.local",
        "**/.env.*.local",
    ):
        assert pattern in root_dockerignore

    web_dockerignore = read("apps/web/Blocks.Web/.dockerignore")
    for pattern in (".env.local", ".env.*.local", "node_modules", "dist"):
        assert pattern in web_dockerignore

    tracked_files = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    assert "services/api-gateway/Blocks.ApiGateway/appsettings.Development.json" not in tracked_files
    assert (
        "plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json"
        not in tracked_files
    )

    smoke_script = read("platform/apphost/validate-browser-smoke.sh")
    assert "BLOCKS_SMOKE_ENVIRONMENT" in smoke_script
