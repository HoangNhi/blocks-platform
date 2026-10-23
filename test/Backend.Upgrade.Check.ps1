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

function Assert-ProjectPackages {
    param(
        [string]$ProjectRelPath,
        [hashtable]$ExpectedPins,
        [hashtable]$ExpectedPrivateAssets = @{},
        [string[]]$ForbiddenPackages = @()
    )
    $fullPath = Join-Path $repoRoot $ProjectRelPath
    Assert-Condition (Test-Path $fullPath) "Project file must exist: $ProjectRelPath"
    [xml]$xml = Get-Content $fullPath -Raw
    $pkgNodes = $xml.SelectNodes('//PackageReference')

    $presentPackages = @{}
    foreach ($node in $pkgNodes) {
        $name = $node.GetAttribute('Include')
        $ver = $node.GetAttribute('Version')
        $privateAssetsNode = $node.SelectSingleNode('PrivateAssets')
        $privateAssets = if ($null -ne $privateAssetsNode) { $privateAssetsNode.InnerText } else { $node.GetAttribute('PrivateAssets') }
        $presentPackages[$name] = @{
            Version = $ver
            PrivateAssets = $privateAssets
        }
    }

    foreach ($name in $ExpectedPins.Keys) {
        $expectedVer = $ExpectedPins[$name]
        Assert-Condition ($presentPackages.ContainsKey($name)) "$ProjectRelPath must directly reference package '$name'"
        $actualVer = $presentPackages[$name].Version
        Assert-Condition ($actualVer -eq $expectedVer) "$ProjectRelPath package '$name' must be pinned to '$expectedVer', found '$actualVer'"
    }

    foreach ($name in $ExpectedPrivateAssets.Keys) {
        $expectedPA = $ExpectedPrivateAssets[$name]
        Assert-Condition ($presentPackages.ContainsKey($name)) "$ProjectRelPath must reference '$name' for PrivateAssets check"
        $actualPA = $presentPackages[$name].PrivateAssets
        Assert-Condition ($actualPA -eq $expectedPA) "$ProjectRelPath package '$name' PrivateAssets must be '$expectedPA', found '$actualPA'"
    }

    foreach ($forbidden in $ForbiddenPackages) {
        Assert-Condition (-not $presentPackages.ContainsKey($forbidden)) "$ProjectRelPath must NOT reference '$forbidden'"
    }
}

function Run-RuntimeChecks {
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
}

function Run-ContainersChecks {
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
}

function Run-PackagesChecks {
    Write-Host "Running package direct pins assertions..."

    # 1. Blocks.Shared
    Assert-ProjectPackages `
        -ProjectRelPath "src/platform/Blocks.Shared/Blocks.Shared.csproj" `
        -ExpectedPins @{
            'FluentValidation' = '12.2.0'
            'Grpc.Net.Client'  = '2.84.0'
        } `
        -ForbiddenPackages @('FluentValidation.AspNetCore')

    # 2. Blocks.ServiceDefaults
    Assert-ProjectPackages `
        -ProjectRelPath "src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj" `
        -ExpectedPins @{
            'Microsoft.Extensions.Http.Resilience'         = '10.11.0'
            'Microsoft.Extensions.ServiceDiscovery'       = '10.11.0'
            'OpenTelemetry.Exporter.OpenTelemetryProtocol' = '1.20.1'
            'OpenTelemetry.Extensions.Hosting'              = '1.20.1'
            'OpenTelemetry.Instrumentation.AspNetCore'     = '1.20.1'
            'OpenTelemetry.Instrumentation.Http'           = '1.20.1'
            'OpenTelemetry.Instrumentation.Runtime'        = '1.20.1'
        }

    # 3. Blocks.FileService
    Assert-ProjectPackages `
        -ProjectRelPath "src/services/Blocks.FileService/Blocks.FileService.csproj" `
        -ExpectedPins @{
            'Google.Protobuf'                                        = '3.36.2'
            'Grpc.AspNetCore'                                        = '2.84.0'
            'Grpc.AspNetCore.Web'                                    = '2.84.0'
            'Grpc.Net.Client.Web'                                    = '2.84.0'
            'Grpc.Net.ClientFactory'                                 = '2.84.0'
            'Grpc.Tools'                                             = '2.84.0'
            'Microsoft.AspNetCore.Authentication.JwtBearer'          = '10.0.13'
            'Microsoft.VisualStudio.Azure.Containers.Tools.Targets' = '1.23.0'
            'Newtonsoft.Json'                                        = '13.0.4'
            'Polly'                                                  = '8.8.0'
            'Stax.AutoDependencyInjectionRegistration'               = '4.0.0'
            'Swashbuckle.AspNetCore'                                 = '10.3.1'
        } `
        -ExpectedPrivateAssets @{
            'Grpc.Tools' = 'all'
        } `
        -ForbiddenPackages @('FluentValidation.AspNetCore')

    # 4. Blocks.SystemService
    Assert-ProjectPackages `
        -ProjectRelPath "src/services/Blocks.SystemService/Blocks.SystemService.csproj" `
        -ExpectedPins @{
            'AutoMapper'                                             = '16.2.0'
            'FluentValidation.DependencyInjectionExtensions'         = '12.2.0'
            'Grpc.AspNetCore'                                        = '2.84.0'
            'Grpc.AspNetCore.Web'                                    = '2.84.0'
            'Grpc.Net.Client.Web'                                    = '2.84.0'
            'Microsoft.AspNetCore.Authentication.JwtBearer'          = '10.0.13'
            'Microsoft.EntityFrameworkCore.Design'                   = '10.0.13'
            'Microsoft.VisualStudio.Azure.Containers.Tools.Targets' = '1.23.0'
            'Newtonsoft.Json'                                        = '13.0.4'
            'Npgsql.EntityFrameworkCore.PostgreSQL'                  = '10.0.3'
            'Stax.AutoDependencyInjectionRegistration'               = '4.0.0'
            'Swashbuckle.AspNetCore'                                 = '10.3.1'
        } `
        -ExpectedPrivateAssets @{
            'Microsoft.EntityFrameworkCore.Design' = 'all'
        } `
        -ForbiddenPackages @('FluentValidation.AspNetCore')

    # 5. Blocks.CatalogService
    Assert-ProjectPackages `
        -ProjectRelPath "src/services/Blocks.CatalogService/Blocks.CatalogService.csproj" `
        -ExpectedPins @{
            'AutoMapper'                                             = '16.2.0'
            'FluentValidation.DependencyInjectionExtensions'         = '12.2.0'
            'Google.Protobuf'                                        = '3.36.2'
            'Grpc.Net.Client.Web'                                    = '2.84.0'
            'Grpc.Net.ClientFactory'                                 = '2.84.0'
            'Grpc.Tools'                                             = '2.84.0'
            'Microsoft.AspNetCore.Authentication.JwtBearer'          = '10.0.13'
            'Microsoft.EntityFrameworkCore.Design'                   = '10.0.13'
            'Microsoft.EntityFrameworkCore.Tools'                    = '10.0.13'
            'Microsoft.VisualStudio.Azure.Containers.Tools.Targets' = '1.23.0'
            'Newtonsoft.Json'                                        = '13.0.4'
            'Polly'                                                  = '8.8.0'
            'MySql.EntityFrameworkCore'                              = '10.0.12'
            'Stax.AutoDependencyInjectionRegistration'               = '4.0.0'
            'Swashbuckle.AspNetCore'                                 = '10.3.1'
        } `
        -ExpectedPrivateAssets @{
            'Grpc.Tools'                           = 'all'
            'Microsoft.EntityFrameworkCore.Design' = 'all'
            'Microsoft.EntityFrameworkCore.Tools'  = 'all'
        } `
        -ForbiddenPackages @('FluentValidation.AspNetCore', 'Pomelo.EntityFrameworkCore.MySql')

    # 6. Harness direct pins
    Assert-ProjectPackages `
        -ProjectRelPath "test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj" `
        -ExpectedPins @{
            'Microsoft.EntityFrameworkCore'           = '10.0.13'
            'Microsoft.EntityFrameworkCore.Relational' = '10.0.13'
        }

    Assert-ProjectPackages `
        -ProjectRelPath "test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj" `
        -ExpectedPins @{
            'Microsoft.EntityFrameworkCore'           = '10.0.13'
            'Microsoft.EntityFrameworkCore.Relational' = '10.0.13'
        }

    # 7. Blocks.ApiGateway
    Assert-ProjectPackages `
        -ProjectRelPath "src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj" `
        -ExpectedPins @{
            'Microsoft.Extensions.ServiceDiscovery.Yarp' = '10.11.0'
            'Yarp.ReverseProxy'                          = '2.3.0'
        }

    $gatewayFullPath = Join-Path $repoRoot "src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj"
    [xml]$gwXml = Get-Content $gatewayFullPath -Raw
    $projRefs = $gwXml.SelectNodes('//ProjectReference')
    foreach ($pRef in $projRefs) {
        $include = $pRef.GetAttribute('Include')
        Assert-Condition ($include -notmatch 'Blocks\.ServiceDefaults') "Blocks.ApiGateway.csproj must NOT reference Blocks.ServiceDefaults, found '$include'"
    }

    # 8. Blocks.AppHost
    Assert-ProjectPackages `
        -ProjectRelPath "src/platform/Blocks.AppHost/Blocks.AppHost.csproj" `
        -ExpectedPins @{
            'Aspire.Hosting.AppHost'    = '13.6.3'
            'Aspire.Hosting.JavaScript' = '13.6.3'
        } `
        -ForbiddenPackages @('Aspire.Hosting.NodeJs', 'Aspire.Hosting.PostgreSQL')

    Write-Host "All package pin checks passed."
}

function Run-AppHostChecks {
    Write-Host "Running AppHost structural assertions..."

    $appHostProjRel = "src/platform/Blocks.AppHost/Blocks.AppHost.csproj"
    $appHostProjPath = Join-Path $repoRoot $appHostProjRel
    Assert-Condition (Test-Path $appHostProjPath) "Project file must exist: $appHostProjRel"

    [xml]$xml = Get-Content $appHostProjPath -Raw

    # TargetFramework == net10.0
    $tfm = $xml.Project.PropertyGroup.TargetFramework | Where-Object { $_ -ne $null -and $_ -ne '' } | Select-Object -First 1
    Assert-Condition ($tfm -eq 'net10.0') "$appHostProjRel TargetFramework must be 'net10.0', found '$tfm'"

    # SDK: Aspire.AppHost.Sdk == 13.6.3
    $sdkNodes = $xml.SelectNodes('//Sdk')
    $aspireSdkNode = $sdkNodes | Where-Object { $_.GetAttribute('Name') -eq 'Aspire.AppHost.Sdk' } | Select-Object -First 1
    $sdkVersion = if ($null -ne $aspireSdkNode) {
        $aspireSdkNode.GetAttribute('Version')
    } else {
        $projectSdk = $xml.Project.GetAttribute('Sdk')
        if ($projectSdk -match 'Aspire\.AppHost\.Sdk/([0-9\.]+)') {
            $Matches[1]
        } else {
            $null
        }
    }
    Assert-Condition ($sdkVersion -eq '13.6.3') "$appHostProjRel Aspire.AppHost.Sdk version must be '13.6.3', found '$sdkVersion'"

    # UserSecretsId must exist
    $userSecretsId = $xml.Project.PropertyGroup.UserSecretsId | Where-Object { $_ -ne $null -and $_ -ne '' } | Select-Object -First 1
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($userSecretsId)) "$appHostProjRel must keep non-empty UserSecretsId"

    # Package references: Aspire.Hosting.AppHost 13.6.3, Aspire.Hosting.JavaScript 13.6.3; no NodeJs, no PostgreSQL
    Assert-ProjectPackages `
        -ProjectRelPath $appHostProjRel `
        -ExpectedPins @{
            'Aspire.Hosting.AppHost'    = '13.6.3'
            'Aspire.Hosting.JavaScript' = '13.6.3'
        } `
        -ForbiddenPackages @('Aspire.Hosting.NodeJs', 'Aspire.Hosting.PostgreSQL')

    # Project references: exactly 4, all paths must exist, no BusinessService
    $projRefNodes = $xml.SelectNodes('//ProjectReference')
    Assert-Condition ($projRefNodes.Count -eq 4) "$appHostProjRel must contain exactly 4 ProjectReference elements, found $($projRefNodes.Count)"

    $appHostDir = Split-Path -Parent $appHostProjPath
    $expectedServices = @('Blocks.FileService.csproj', 'Blocks.SystemService.csproj', 'Blocks.CatalogService.csproj', 'Blocks.ApiGateway.csproj')
    $foundServices = @()

    foreach ($pRef in $projRefNodes) {
        $include = $pRef.GetAttribute('Include')
        Assert-Condition ($include -notmatch 'Blocks\.BusinessService') "$appHostProjRel must NOT reference Blocks.BusinessService, found '$include'"
        $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $appHostDir $include))
        Assert-Condition (Test-Path $resolvedPath) "$appHostProjRel ProjectReference target must exist on disk: '$include' ($resolvedPath)"
        $fileName = [System.IO.Path]::GetFileName($resolvedPath)
        $foundServices += $fileName
    }

    foreach ($svc in $expectedServices) {
        Assert-Condition ($foundServices -contains $svc) "$appHostProjRel ProjectReferences must include '$svc'"
    }

    # Source checks on src/platform/Blocks.AppHost/AppHost.cs
    $csRel = "src/platform/Blocks.AppHost/AppHost.cs"
    $csPath = Join-Path $repoRoot $csRel
    Assert-Condition (Test-Path $csPath) "AppHost source file must exist: $csRel"
    $csContent = Get-Content $csPath -Raw

    # Exactly 4 AddProject calls
    $addProjectMatches = [regex]::Matches($csContent, 'AddProject<Projects\.([A-Za-z0-9_]+)>\("([A-Za-z0-9_]+)"\)')
    Assert-Condition ($addProjectMatches.Count -eq 4) "$csRel must contain exactly 4 AddProject calls, found $($addProjectMatches.Count)"
    $addProjectNames = $addProjectMatches | ForEach-Object { $_.Groups[2].Value }
    foreach ($svcName in @('FileService', 'SystemService', 'CatalogService', 'ApiGateway')) {
        Assert-Condition ($addProjectNames -contains $svcName) "$csRel AddProject calls must include '$svcName'"
    }

    # Web resource uses AddJavaScriptApp("Web", "../../apps/Blocks.Web", "dev")
    Assert-Condition ($csContent -match 'AddJavaScriptApp\(\s*"Web"\s*,\s*"\.\./\.\./apps/Blocks\.Web"\s*,\s*"dev"\s*\)') `
        "$csRel Web resource must use AddJavaScriptApp(`"Web`", `"../../apps/Blocks.Web`", `"dev`")"

    # Endpoint port 5173 (e.g. VITE_DEV_PORT)
    Assert-Condition ($csContent -match '5173') "$csRel must configure endpoint port 5173"
    Assert-Condition ($csContent -match 'VITE_DEV_PORT') "$csRel must reference env var VITE_DEV_PORT"

    # Forbidden strings / patterns
    Assert-Condition ($csContent -notmatch 'Collab') "$csRel must NOT reference Collab"
    Assert-Condition ($csContent -notmatch 'Business') "$csRel must NOT reference Business"
    Assert-Condition ($csContent -notmatch 'AddNpmApp') "$csRel must NOT use AddNpmApp"
    Assert-Condition ($csContent -notmatch 'AddViteApp') "$csRel must NOT use AddViteApp"
    Assert-Condition ($csContent -notmatch 'WaitFor') "$csRel must NOT use WaitFor"

    # Keeps mutual discovery references between FileService and SystemService without WaitFor
    Assert-Condition ($csContent -match 'systemService.*WithReference\(\s*fileService\s*\)' -or $csContent -match 'WithReference\(\s*fileService\s*\)') `
        "$csRel must keep reference from systemService to fileService"
    Assert-Condition ($csContent -match 'fileService\.WithReference\(\s*systemService\s*\)') `
        "$csRel must keep reference from fileService to systemService"

    # Keeps Web WithReference(gateway) / external endpoint
    Assert-Condition ($csContent -match 'WithReference\(\s*gateway\s*\)') "$csRel Web must include WithReference(gateway)"
    Assert-Condition ($csContent -match 'WithExternalHttpEndpoints\(\s*\)') "$csRel Web must include WithExternalHttpEndpoints()"

    Write-Host "All AppHost checks passed."
}

if ($Check -eq 'runtime') {
    Run-RuntimeChecks
    exit 0
}
elseif ($Check -eq 'containers') {
    Run-ContainersChecks
    exit 0
}
elseif ($Check -eq 'packages') {
    Run-PackagesChecks
    exit 0
}
elseif ($Check -eq 'apphost') {
    Run-AppHostChecks
    exit 0
}
elseif ($Check -eq 'all') {
    Run-RuntimeChecks
    Run-ContainersChecks
    Run-PackagesChecks
    Run-AppHostChecks
    Write-Host "All checks passed."
    exit 0
}
else {
    Write-Error "Mode '$Check' is not recognized."
    exit 1
}
