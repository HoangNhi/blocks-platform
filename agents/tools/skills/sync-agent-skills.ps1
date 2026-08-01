param(
    [string]$RepoRoot,
    [string]$HermesSkillsRoot,
    [switch]$Check
)

. (Join-Path $PSScriptRoot 'agent-skills.common.ps1')

if (-not $RepoRoot) { $RepoRoot = Get-AgentSkillsRepoRoot }
if (-not $HermesSkillsRoot -and $env:HERMES_DATA_PATH) {
    $HermesSkillsRoot = Join-Path $env:HERMES_DATA_PATH 'skills'
}

$manifestPath = Join-Path $RepoRoot 'agents\skills-manifest.yaml'
$entries = @(Read-AgentSkillsManifest -ManifestPath $manifestPath)
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash

function Get-TargetDefinitions {
    param([string]$Root, [string]$HermesRoot)
    $definitions = @(
        [pscustomobject]@{ Name = 'agents'; Root = (Join-Path $Root '.agents\skills'); Aliases = @('codex', 'agy') },
        [pscustomobject]@{ Name = 'claude'; Root = (Join-Path $Root '.claude\skills'); Aliases = @('claude') }
    )
    if ($HermesRoot) {
        $definitions += [pscustomobject]@{ Name = 'hermes'; Root = $HermesRoot; Aliases = @('hermes') }
    }
    return $definitions
}

function Get-EntriesForTarget {
    param([pscustomobject]$Definition)
    return @($entries | Where-Object {
        $_.status -in @('active', 'experimental') -and
        @($_.targets | Where-Object { $Definition.Aliases -contains $_ }).Count -gt 0
    })
}

function Publish-Catalog {
    param([pscustomobject]$Definition)

    New-Item -ItemType Directory -Force -Path $Definition.Root | Out-Null
    $targetEntries = @(Get-EntriesForTarget -Definition $Definition)
    foreach ($entry in $targetEntries) {
        $destination = Join-Path $Definition.Root $entry.target_name
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        $sourceRoot = Get-AgentSkillSourceRoot -RepoRoot $RepoRoot -Entry $entry
        Copy-Item -LiteralPath $sourceRoot -Destination $destination -Recurse -Force
        Set-AgentSkillNameInFile -SkillMarkdownPath (Join-Path $destination 'SKILL.md') -TargetName $entry.target_name
        if ($entry.publish_mode -eq 'patched' -and $entry.rewrite_rules -eq 'runtime-root-prefix') {
            $skillMarkdown = Join-Path $destination 'SKILL.md'
            $content = Get-Content -LiteralPath $skillMarkdown -Raw -Encoding UTF8
            $replacement = if ($Definition.Name -eq 'claude') { '.claude/skills/impeccable/' } else { '.agents/skills/impeccable/' }
            Write-Utf8NoBomFile -Path $skillMarkdown -Content $content.Replace('.claude/skills/impeccable/', $replacement)
        }
    }
    $marker = [ordered]@{
        version = 1
        target = $Definition.Name
        manifestSha256 = $manifestHash
        skills = @($targetEntries.target_name | Sort-Object)
    } | ConvertTo-Json -Depth 4
    Write-Utf8NoBomFile -Path (Join-Path $Definition.Root '.blocks-agent-skills.generated.json') -Content $marker
}

$definitions = @(Get-TargetDefinitions -Root $RepoRoot -HermesRoot $HermesSkillsRoot)
if (-not $Check) {
    foreach ($definition in $definitions) { Publish-Catalog -Definition $definition }
    Write-Output 'sync-complete'
    exit 0
}

$checkRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("blocks-agent-skills-check-" + [guid]::NewGuid().ToString('N'))
try {
    foreach ($definition in $definitions) {
        $expected = [pscustomobject]@{
            Name = $definition.Name
            Root = (Join-Path $checkRoot $definition.Name)
            Aliases = $definition.Aliases
        }
        Publish-Catalog -Definition $expected
        if (-not (Test-Path -LiteralPath $definition.Root)) { continue }
        $managedNames = @(Get-EntriesForTarget -Definition $definition).target_name
        $hasManagedContent = Test-Path -LiteralPath (Join-Path $definition.Root '.blocks-agent-skills.generated.json')
        if (-not $hasManagedContent) {
            $hasManagedContent = @($managedNames | Where-Object { Test-Path -LiteralPath (Join-Path $definition.Root $_) }).Count -gt 0
        }
        if (-not $hasManagedContent) { continue }
        if ((Get-AgentSkillTreeHash -Root $definition.Root) -ne (Get-AgentSkillTreeHash -Root $expected.Root)) {
            Write-Error "generated-skill-drift: $($definition.Name)"
            exit 1
        }
    }
}
finally {
    if (Test-Path -LiteralPath $checkRoot) { Remove-Item -LiteralPath $checkRoot -Recurse -Force }
}

Write-Output 'sync-check-complete'
