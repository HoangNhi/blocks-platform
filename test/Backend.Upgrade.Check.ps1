[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('runtime', 'containers', 'packages', 'apphost', 'all')]
    [string]$Check
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot/..").Path

function Assert-Condition {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

if ($Check -eq 'runtime') {
    Write-Host "Running runtime target and toolchain assertions..."

    # 1. global.json
    $globalJsonPath = Join-Path $repoRoot "global.json"
    Assert-Condition (Test-Path $globalJsonPath) "global.json must exist at repo root ($globalJsonPath)"
    $globalJson = Get-Content $globalJsonPath -Raw | ConvertFrom-Json
    Assert-Condition ($globalJson.sdk -ne $null) "global.json must contain sdk object"
    Assert-Condition ($globalJson.sdk.version -eq '10.0.402') "global.json sdk.version must be '10.0.402', found '$($globalJson.sdk.version)'"
    Assert-Condition ($globalJson.sdk.rollForward -eq 'latestPatch') "global.json sdk.rollForward must be 'latestPatch', found '$($globalJson.sdk.rollForward)'"
    Assert-Condition ($globalJson.sdk.allowPrerelease -eq $false) "global.json sdk.allowPrerelease must be false, found '$($globalJson.sdk.allowPrerelease)'"

    # 2. 6 target projects outside AppHost target net10.0
    $targetProjects = @(
        "src/platform/Blocks.Shared/Blocks.Shared.csproj",
        "src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj",
        "src/services/Blocks.FileService/Blocks.FileService.csproj",
        "src/services/Blocks.SystemService/Blocks.SystemService.csproj",
        "src/services/Blocks.CatalogService/Blocks.CatalogService.csproj",
        "src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj"
    )

    foreach ($projRel in $targetProjects) {
        $projPath = Join-Path $repoRoot $projRel
        Assert-Condition (Test-Path $projPath) "Project file must exist: $projRel"
        [xml]$projXml = Get-Content $projPath -Raw
        $tfm = $projXml.Project.PropertyGroup.TargetFramework | Where-Object { $_ -ne $null -and $_ -ne '' } | Select-Object -First 1
        Assert-Condition ($tfm -eq 'net10.0') "$projRel TargetFramework must be 'net10.0', found '$tfm'"
    }

    # 3. 3 test harness projects target net10.0
    $harnessProjects = @(
        "test/FileService.RemovalChecks/FileService.RemovalChecks.csproj",
        "test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj",
        "test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj"
    )

    foreach ($projRel in $harnessProjects) {
        $projPath = Join-Path $repoRoot $projRel
        Assert-Condition (Test-Path $projPath) "Harness project file must exist: $projRel"
        [xml]$projXml = Get-Content $projPath -Raw
        $tfm = $projXml.Project.PropertyGroup.TargetFramework | Where-Object { $_ -ne $null -and $_ -ne '' } | Select-Object -First 1
        Assert-Condition ($tfm -eq 'net10.0') "$projRel TargetFramework must be 'net10.0', found '$tfm'"
    }

    # 4. 2 dotnet-tools.json manifests pin dotnet-ef to 10.0.13
    $toolManifests = @(
        "src/services/Blocks.FileService/dotnet-tools.json",
        "src/services/Blocks.ApiGateway/dotnet-tools.json"
    )

    foreach ($manifestRel in $toolManifests) {
        $manifestPath = Join-Path $repoRoot $manifestRel
        Assert-Condition (Test-Path $manifestPath) "Tool manifest must exist: $manifestRel"
        $manifestJson = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $efTool = $manifestJson.tools.'dotnet-ef'
        Assert-Condition ($efTool -ne $null) "$manifestRel must contain 'dotnet-ef' tool"
        Assert-Condition ($efTool.version -eq '10.0.13') "$manifestRel dotnet-ef version must be '10.0.13', found '$($efTool.version)'"
    }

    Write-Host "All runtime target checks passed."
    exit 0
}
elseif ($Check -eq 'containers') {
    Write-Host "Running container definitions assertions..."

    $dockerfiles = @(
        "src/services/Blocks.FileService/Dockerfile",
        "src/services/Blocks.SystemService/Dockerfile",
        "src/services/Blocks.CatalogService/Dockerfile"
    )

    foreach ($dfRel in $dockerfiles) {
        $dfPath = Join-Path $repoRoot $dfRel
        Assert-Condition (Test-Path $dfPath) "Dockerfile must exist: $dfRel"
        $content = Get-Content $dfPath -Raw

        # Base image net10
        Assert-Condition ($content -match 'FROM\s+mcr\.microsoft\.com/dotnet/aspnet:10\.0\s+AS\s+base') "$dfRel must use mcr.microsoft.com/dotnet/aspnet:10.0 base stage"
        # Build image net10
        Assert-Condition ($content -match 'FROM\s+mcr\.microsoft\.com/dotnet/sdk:10\.0\s+AS\s+build') "$dfRel must use mcr.microsoft.com/dotnet/sdk:10.0 build stage"
        # Non-root USER $APP_UID
        Assert-Condition ($content -match 'USER\s+\$APP_UID') "$dfRel must configure non-root USER `$APP_UID"

        # COPY ["global.json", "./"] after WORKDIR /src before restore
        $workdirIdx = $content.IndexOf('WORKDIR "/src"')
        if ($workdirIdx -lt 0) { $workdirIdx = $content.IndexOf('WORKDIR /src') }
        $copyGlobalIdx = $content.IndexOf('COPY ["global.json", "./"]')
        $restoreIdx = $content.IndexOf('RUN dotnet restore')

        Assert-Condition ($workdirIdx -ge 0) "$dfRel must contain WORKDIR /src"
        Assert-Condition ($copyGlobalIdx -ge 0) "$dfRel must contain COPY [`"global.json`", `"./`"]"
        Assert-Condition ($restoreIdx -ge 0) "$dfRel must contain RUN dotnet restore"
        Assert-Condition ($copyGlobalIdx -gt $workdirIdx -and $copyGlobalIdx -lt $restoreIdx) "$dfRel must COPY global.json after WORKDIR /src and before RUN dotnet restore"

        # Single publish - no duplicate suppression
        $publishMatches = [regex]::Matches($content, 'RUN\s+dotnet\s+publish')
        Assert-Condition ($publishMatches.Count -eq 1) "$dfRel must contain exactly 1 dotnet publish command, found $($publishMatches.Count)"
    }

    # Linked proto preservation
    $fileIgnorePath = Join-Path $repoRoot "src/services/Blocks.FileService/Dockerfile.dockerignore"
    Assert-Condition (Test-Path $fileIgnorePath) "FileService Dockerfile.dockerignore must exist"
    $fileIgnoreContent = Get-Content $fileIgnorePath -Raw
    Assert-Condition ($fileIgnoreContent -match '!src/services/Blocks\.SystemService/Protos/audit\.proto') "FileService Dockerfile.dockerignore must not omit linked audit.proto"

    $catalogIgnorePath = Join-Path $repoRoot "src/services/Blocks.CatalogService/Dockerfile.dockerignore"
    Assert-Condition (Test-Path $catalogIgnorePath) "CatalogService Dockerfile.dockerignore must exist"
    $catalogIgnoreContent = Get-Content $catalogIgnorePath -Raw
    Assert-Condition ($catalogIgnoreContent -match '!src/services/Blocks\.SystemService/Protos/audit\.proto') "CatalogService Dockerfile.dockerignore must not omit linked audit.proto"
    Assert-Condition ($catalogIgnoreContent -match '!src/services/Blocks\.SystemService/Protos/system\.proto') "CatalogService Dockerfile.dockerignore must not omit linked system.proto"

    # Dockerfile.dockerignore files permit global.json
    Assert-Condition ($fileIgnoreContent -match '(?m)^!global\.json\s*$') "FileService Dockerfile.dockerignore must permit global.json via !global.json"
    Assert-Condition ($catalogIgnoreContent -match '(?m)^!global\.json\s*$') "CatalogService Dockerfile.dockerignore must permit global.json via !global.json"

    Write-Host "All container checks passed."
    exit 0
}
else {
    Write-Error "Mode '$Check' is not implemented in this phase (runtime and containers are implemented in Task 2)."
    exit 1
}
