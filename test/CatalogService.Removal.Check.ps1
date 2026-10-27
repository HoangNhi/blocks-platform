$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$catalogDir = Join-Path $repoRoot 'src\services\Blocks.CatalogService'
$csprojPath = Join-Path $catalogDir 'Blocks.CatalogService.csproj'

if (-not (Test-Path $csprojPath)) {
    throw "Cannot find csproj at $csprojPath"
}

# Scan sources excluding bin/obj
$sourceFiles = Get-ChildItem -Path $catalogDir -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and
    $_.Extension -match '^\.(cs|csproj|proto)$'
}

$programPath = Join-Path $catalogDir 'Program.cs'
$configPath = Join-Path $catalogDir 'Configs\ConfigService.cs'

$program = if (Test-Path $programPath) { Get-Content -Raw $programPath } else { '' }
$config = if (Test-Path $configPath) { Get-Content -Raw $configPath } else { '' }

# Assert retired controllers removed
$retiredControllers = @('FileTypeController.cs', 'StakeholderController.cs', 'StandardController.cs', 'StandardSetController.cs')
foreach ($ctrl in $retiredControllers) {
    if (Test-Path (Join-Path $catalogDir "Controllers\$ctrl")) {
        throw "Retired controller remains: $ctrl"
    }
}

# Assert retired entities removed
$retiredEntities = @('Criterion.cs', 'CriterionRequirement.cs', 'FileType.cs', 'Stakeholder.cs', 'Standard.cs', 'StandardSet.cs')
foreach ($entity in $retiredEntities) {
    if (Test-Path (Join-Path $catalogDir "Entities\$entity")) {
        throw "Retired entity remains: $entity"
    }
}

# Assert retired service directories removed
$retiredDomains = @('FileType', 'Stakeholder', 'Standard', 'StandardSet')
foreach ($domain in $retiredDomains) {
    $serviceDir = Join-Path $catalogDir "Services\CoreFeature\$domain"
    if (Test-Path $serviceDir) {
        throw "Retired service directory remains: Services\CoreFeature\$domain"
    }
    $dtoDir = Join-Path $catalogDir "DTOs\CoreFeature\$domain"
    if (Test-Path $dtoDir) {
        throw "Retired DTO directory remains: DTOs\CoreFeature\$domain"
    }
}

# Assert Catalog gRPC server and proto removed
if (Test-Path (Join-Path $catalogDir 'Services\gRPC\CatalogGrpcService.cs')) {
    throw 'Retired CatalogGrpcService remains'
}
if (Test-Path (Join-Path $catalogDir 'Protos\catalog.proto')) {
    throw 'Retired catalog.proto remains'
}
if ($program -match 'MapGrpcService<CatalogGrpcService>|UseGrpcWeb') {
    throw 'Catalog gRPC server remains in Program.cs'
}
if ($config -match 'services\.AddGrpc\(\)') {
    throw 'Catalog server AddGrpc remains in ConfigService.cs'
}

# Parse csproj XML
[xml]$csprojXml = Get-Content -Raw $csprojPath
$protoNodes = $csprojXml.SelectNodes('//Protobuf')

foreach ($node in $protoNodes) {
    $include = $node.GetAttribute('Include')
    if ($include -match 'catalog\.proto|CatalogProto') {
        throw "Retired protobuf node remains in csproj: $include"
    }
}

# Assert system and audit client protobufs exist and configured as Client
$requiredClientProtos = @(
    '..\Blocks.SystemService\Protos\system.proto',
    '..\Blocks.SystemService\Protos\audit.proto'
)

foreach ($reqProto in $requiredClientProtos) {
    $node = $protoNodes | Where-Object { $_.GetAttribute('Include') -eq $reqProto }
    if ($null -eq $node) {
        throw "Required client protobuf missing in csproj: $reqProto"
    }
    if ($node.GetAttribute('GrpcServices') -ne 'Client') {
        throw "Protobuf $reqProto must have GrpcServices='Client'"
    }
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $catalogDir $reqProto))
    if (-not (Test-Path $fullPath)) {
        throw "Referenced client protobuf file does not exist: $fullPath"
    }
}

# Assert audit interceptor and filter registrations
if ($config -notmatch 'AuditInterceptor' -or $config -notmatch 'AuditActionFilter') {
    throw 'Audit registration missing in ConfigService.cs'
}
if ($program -notmatch 'AuditActionFilter') {
    throw 'AuditActionFilter registration missing in Program.cs'
}

# Assert gRPC client registrations for SystemProto and AuditProto
if ($config -notmatch 'AddGrpcClient<SystemProto\.SystemProtoClient>') {
    throw 'SystemProto client registration missing'
}
if ($config -notmatch 'AddGrpcClient<AuditProto\.AuditProtoClient>') {
    throw 'AuditProto client registration missing'
}

# Assert Catalog targets net10.0 and Oracle provider
$catalogTf = $csprojXml.SelectSingleNode('//TargetFramework')
if ($catalogTf.InnerText -ne 'net10.0') {
    throw "catalog_targets_net10_and_oracle: Catalog TargetFramework is $($catalogTf.InnerText), expected net10.0"
}
$oraclePkg = $csprojXml.SelectSingleNode('//PackageReference[@Include="MySql.EntityFrameworkCore"]')
if ($null -eq $oraclePkg -or $oraclePkg.GetAttribute('Version') -ne '10.0.12') {
    throw "catalog_targets_net10_and_oracle: MySql.EntityFrameworkCore 10.0.12 package missing or wrong version"
}
$pomeloPkg = $csprojXml.SelectSingleNode('//PackageReference[@Include="Pomelo.EntityFrameworkCore.MySql"]')
if ($null -ne $pomeloPkg) {
    throw "catalog_targets_net10_and_oracle: Pomelo.EntityFrameworkCore.MySql direct package reference must be removed"
}
$jwtPkg = $csprojXml.SelectSingleNode('//PackageReference[@Include="Microsoft.AspNetCore.Authentication.JwtBearer"]')
if ($null -eq $jwtPkg -or $jwtPkg.GetAttribute('Version') -ne '10.0.13') {
    throw "catalog_targets_net10_and_oracle: Microsoft.AspNetCore.Authentication.JwtBearer 10.0.13 package missing or wrong version"
}
$protoPkg = $csprojXml.SelectSingleNode('//PackageReference[@Include="Google.Protobuf"]')
if ($null -eq $protoPkg -or $protoPkg.GetAttribute('Version') -ne '3.36.2') {
    throw "catalog_targets_net10_and_oracle: Google.Protobuf 3.36.2 package missing or wrong version"
}
foreach ($efPkgName in @('Microsoft.EntityFrameworkCore.Design', 'Microsoft.EntityFrameworkCore.Tools')) {
    $efPkg = $csprojXml.SelectSingleNode("//PackageReference[@Include='$efPkgName']")
    if ($null -eq $efPkg -or $efPkg.GetAttribute('Version') -ne '10.0.13') {
        throw "catalog_targets_net10_and_oracle: $efPkgName 10.0.13 package missing or wrong version"
    }
}

# Assert CleanupChecks harness targets net10.0 and EF Core 10
$harnessCsprojPath = Join-Path $repoRoot 'test\CatalogService.CleanupChecks\CatalogService.CleanupChecks.csproj'
if (-not (Test-Path $harnessCsprojPath)) {
    throw "Cannot find harness csproj at $harnessCsprojPath"
}
[xml]$harnessXml = Get-Content -Raw $harnessCsprojPath
$harnessTf = $harnessXml.SelectSingleNode('//TargetFramework')
if ($harnessTf.InnerText -ne 'net10.0') {
    throw "cleanup_harness_targets_net10: Harness TargetFramework is $($harnessTf.InnerText), expected net10.0"
}
foreach ($efPkgName in @('Microsoft.EntityFrameworkCore', 'Microsoft.EntityFrameworkCore.Relational')) {
    $efPkg = $harnessXml.SelectSingleNode("//PackageReference[@Include='$efPkgName']")
    if ($null -eq $efPkg -or $efPkg.GetAttribute('Version') -ne '10.0.13') {
        throw "cleanup_harness_targets_net10: $efPkgName 10.0.13 package missing or wrong version"
    }
}

$dockerfile = Get-Content -Raw (Join-Path $catalogDir 'Dockerfile')
foreach ($image in @('aspnet', 'sdk')) {
    if ($dockerfile -notmatch "(?m)^FROM mcr\.microsoft\.com/dotnet/${image}:10\.0 AS ") {
        throw "catalog_container_targets_net10: $image must use official 10.0 image"
    }
}
foreach ($line in @(
    'USER $APP_UID',
    'EXPOSE 8080',
    'EXPOSE 8081',
    'COPY ["src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj", "platform/Blocks.ServiceDefaults/"]',
    'COPY ["src/platform/Blocks.Shared/Blocks.Shared.csproj", "platform/Blocks.Shared/"]',
    'COPY ["src/services/Blocks.CatalogService/Blocks.CatalogService.csproj", "services/Blocks.CatalogService/"]',
    'COPY src .',
    'ENTRYPOINT ["dotnet", "Blocks.CatalogService.dll"]'
)) {
    if (-not ($dockerfile -split '\r?\n' -contains $line)) {
        throw "Catalog container contract changed: $line"
    }
}

Write-Output 'PASS CatalogService removal checks'
