$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$systemServiceDir = Join-Path $repoRoot 'src\services\Blocks.SystemService'
$csprojPath = Join-Path $systemServiceDir 'Blocks.SystemService.csproj'

if (-not (Test-Path $csprojPath)) {
    throw "Cannot find csproj at $csprojPath"
}

[xml]$csprojXml = Get-Content -Raw $csprojPath

$protoNodes = $csprojXml.SelectNodes('//Protobuf')
$protos = @($protoNodes | ForEach-Object { $_.GetAttribute('Include') })

$projectRefNodes = $csprojXml.SelectNodes('//ProjectReference')
$projectRefs = @($projectRefNodes | ForEach-Object { $_.GetAttribute('Include') })

$files = Get-ChildItem -Path $systemServiceDir -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and
    $_.Extension -match '^\.(cs|csproj|json|proto)$'
}

$sources = ($files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

# $protos: Include của các node Protobuf; $sources: nội dung source đã lọc.
if ($protos -match 'Blocks\.BusinessService') { throw 'Business protobuf reference remains' }
if ($sources -match 'Blocks\.BusinessService|BusinessProto|business\.proto|GrpcClients:BusinessService|http://BusinessService|CheckExternalReviewerAccess') {
    throw 'BusinessService dependency remains'
}
if ($protos -notcontains '..\Blocks.FileService\Protos\file.proto') { throw 'FileService protobuf missing' }
if ($protos -notcontains 'Protos\system.proto') { throw 'System protobuf missing' }
if ($protos -notcontains 'Protos\audit.proto') { throw 'Audit protobuf missing' }

# Check existence of all remaining Protobuf and ProjectReference files
foreach ($p in $protos) {
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $systemServiceDir $p))
    if (-not (Test-Path $fullPath)) {
        throw "Protobuf file missing: $p"
    }
}

foreach ($pr in $projectRefs) {
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $systemServiceDir $pr))
    if (-not (Test-Path $fullPath)) {
        throw "ProjectReference file missing: $pr"
    }
}

Write-Output 'PASS BusinessService dependency checks'
