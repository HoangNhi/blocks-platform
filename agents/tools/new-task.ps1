param(
    [Parameter(Mandatory = $true)]
    [string]$TaskPath,
    [string]$VaultPath = $env:OBSIDIAN_VAULT_PATH,
    [string]$RepoRoot = (Join-Path $PSScriptRoot '..\..')
)

$ErrorActionPreference = 'Stop'

if (-not $VaultPath -or -not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
    throw 'BLOCKED: OBSIDIAN_VAULT_PATH must reference an existing external Knowledge vault'
}
if (-not [System.IO.Path]::IsPathRooted($VaultPath)) {
    throw 'BLOCKED: Knowledge vault must be an absolute path'
}

$segments = @($TaskPath -split '[\\/]')
if ([System.IO.Path]::IsPathRooted($TaskPath) -or $segments.Count -lt 2) {
    throw 'BLOCKED: TaskPath must be an exact vault-relative task folder'
}
foreach ($segment in $segments) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -in @('.', '..') -or
        $segment -match '[<>:"|?*]' -or $segment.EndsWith('.') -or $segment.EndsWith(' ') -or
        $segment -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {
        throw 'BLOCKED: TaskPath contains an unsafe path component'
    }
}

$vaultRoot = [System.IO.Path]::GetFullPath($VaultPath).TrimEnd('\', '/')
$repositoryRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
if ($vaultRoot.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $vaultRoot.StartsWith($repositoryRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
    $repositoryRoot.StartsWith($vaultRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'BLOCKED: Knowledge vault must be outside the repository'
}
$basePath = [System.IO.Path]::GetFullPath((Join-Path $vaultRoot ($segments -join '\')))
if (-not $basePath.StartsWith($vaultRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'BLOCKED: TaskPath escapes Knowledge vault'
}

$ancestor = $basePath
while ($ancestor) {
    if (Test-Path -LiteralPath $ancestor) {
        $item = Get-Item -LiteralPath $ancestor -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'BLOCKED: TaskPath and vault ancestors must be real directories, not links'
        }
    }
    $ancestor = Split-Path -Path $ancestor -Parent
}
if (Test-Path -LiteralPath $basePath) {
    throw 'BLOCKED: Task already exists; read its records instead of scaffolding over them'
}

New-Item -ItemType Directory -Path $basePath | Out-Null
$datePart = (Get-Date).ToString('yyyy-MM-dd')
$contents = [ordered]@{
    'spec.md' = "# Specification
"
    'plan.md' = "# Plan
"
    'execution.md' = "---
status: not_started
approval: required
updated: $datePart
---

# Execution
"
    'review.md' = "# Review
"
}
foreach ($filename in $contents.Keys) {
    $stream = [System.IO.File]::Open((Join-Path $basePath $filename), [System.IO.FileMode]::CreateNew)
    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($contents[$filename])
        $stream.Write($bytes, 0, $bytes.Length)
    }
    finally {
        $stream.Dispose()
    }
}
Write-Output $basePath
