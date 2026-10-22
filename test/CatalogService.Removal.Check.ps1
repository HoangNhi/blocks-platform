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

Write-Output 'PASS CatalogService removal checks'
