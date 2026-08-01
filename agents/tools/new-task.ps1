param(
    [ValidateSet('approved', 'draft')]
    [string]$Mode = 'approved',
    [Parameter(Mandatory = $true)]
    [string]$Slug,
    [ValidateSet('service', 'cross-service', 'agent-workflow')]
    [string]$Scope,
    [string]$Service,
    [string]$RepoRoot,
    [string]$VaultPath = $env:OBSIDIAN_VAULT_PATH,
    [datetime]$Date = (Get-Date)
)

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$datePart = $Date.ToString('yyyy-MM-dd')

if ($Mode -eq 'approved') {
    if (-not $RepoRoot) {
        $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    }
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
    $basePath = Join-Path $RepoRoot "docs\tasks\$datePart-$Slug"
    New-Item -ItemType Directory -Force -Path $basePath | Out-Null

    $simpleFiles = @('spec.md', 'plan.md', 'review.md')
    foreach ($file in $simpleFiles) {
        $path = Join-Path $basePath $file
        if (-not (Test-Path -LiteralPath $path)) {
            Write-Utf8NoBomFile -Path $path -Content "# $file`n"
        }
    }

    $executionPath = Join-Path $basePath 'execution.md'
    if (-not (Test-Path -LiteralPath $executionPath)) {
        $executionContent = @"
---
type: execution
status: not_started
mode: light
current_step: 0
last_completed_step: 0
next_step: ""
updated: $datePart
---

# Execution

## Current State
- Goal:
- Current focus:
- Last completed step:
- Next step:
- Blockers:
- Key files:
- Verification status:

## Activity Log
- $datePart 00:00 - Task scaffolded.
"@
        Write-Utf8NoBomFile -Path $executionPath -Content $executionContent
    }

    Write-Output $basePath
    exit 0
}

# Draft mode
if (-not $Scope) {
    throw 'Scope is required when Mode=draft'
}

if (-not $VaultPath -or -not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
    throw 'OBSIDIAN_VAULT_PATH must reference an existing external vault'
}

$VaultPath = [System.IO.Path]::GetFullPath($VaultPath)

if ($Scope -eq 'service' -and -not $Service) {
    throw 'Service is required when Scope=service'
}

$basePath = switch ($Scope) {
    'cross-service' { Join-Path $VaultPath "cross-service\$datePart-$Slug" }
    'agent-workflow' { Join-Path $VaultPath "agent-workflow\tasks\$datePart-$Slug" }
    default { Join-Path $VaultPath "services\$Service\tasks\$datePart-$Slug" }
}

New-Item -ItemType Directory -Force -Path $basePath | Out-Null

$simpleFiles = @('spec.md', 'plan.md', 'notes.md')
foreach ($file in $simpleFiles) {
    $path = Join-Path $basePath $file
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Utf8NoBomFile -Path $path -Content "# $file`n"
    }
}

$executionPath = Join-Path $basePath 'execution.md'
if (-not (Test-Path -LiteralPath $executionPath)) {
    $executionContent = @"
---
type: execution
status: not_started
mode: light
current_step: 0
last_completed_step: 0
next_step: ""
updated: $datePart
---

# Execution

## Current State
- Goal:
- Current focus:
- Last completed step:
- Next step:
- Blockers:
- Key files:
- Verification status:

## Activity Log
- $datePart 00:00 - Task scaffolded.
"@
    Write-Utf8NoBomFile -Path $executionPath -Content $executionContent
}

Write-Output $basePath
