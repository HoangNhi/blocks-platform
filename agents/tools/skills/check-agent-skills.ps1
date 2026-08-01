param(
    [string]$RepoRoot,
    [string]$HermesSkillsRoot,
    [switch]$Json
)

. (Join-Path $PSScriptRoot 'agent-skills.common.ps1')

if (-not $RepoRoot) { $RepoRoot = Get-AgentSkillsRepoRoot }
$manifestPath = Join-Path $RepoRoot 'agents\skills-manifest.yaml'
$entries = @(Read-AgentSkillsManifest -ManifestPath $manifestPath)
$results = @()

$duplicates = $entries | Group-Object target_name | Where-Object { $_.Count -gt 1 }
foreach ($duplicate in $duplicates) {
    $results += [pscustomobject]@{ target_name = $duplicate.Name; classification = 'invalid'; reasons = @('duplicate-target-name') }
}

foreach ($entry in $entries) {
    $skillRoot = Get-AgentSkillSourceRoot -RepoRoot $RepoRoot -Entry $entry
    $reasons = @()
    $classification = 'standalone-ready'
    if (-not (Test-Path -LiteralPath $skillRoot)) {
        $classification = 'invalid'; $reasons += 'missing-source-root'
    }
    elseif (-not (Test-Path -LiteralPath (Join-Path $skillRoot 'SKILL.md'))) {
        $classification = 'invalid'; $reasons += 'missing-skill-md'
    }
    else {
        $content = Get-Content -LiteralPath (Join-Path $skillRoot 'SKILL.md') -Raw -Encoding UTF8
        if ($entry.publish_mode -eq 'family') { $classification = 'family-required'; $reasons += 'manifest-family' }
        if ($content -match '\.\./') { $classification = 'family-required'; $reasons += 'relative-parent-reference' }
        if ($entry.publish_mode -eq 'patched') { $classification = 'patch-required'; $reasons += 'manifest-patched' }
        if ($content -match '\.claude/skills/' -or $content -match '/mnt/skills/') {
            $classification = 'patch-required'; $reasons += 'runtime-specific-path'
        }
        if ($entry.publish_mode -eq 'skip') { $classification = 'skip-recommended'; $reasons += 'manifest-skip' }
    }
    $results += [pscustomobject]@{ target_name = $entry.target_name; classification = $classification; reasons = @($reasons | Select-Object -Unique) }
}

$gitDirectory = & git -C $RepoRoot rev-parse --git-dir 2>$null
if ($LASTEXITCODE -eq 0 -and $gitDirectory) {
    $moduleText = if (Test-Path -LiteralPath (Join-Path $RepoRoot '.gitmodules')) { Get-Content -LiteralPath (Join-Path $RepoRoot '.gitmodules') -Raw } else { '' }
    foreach ($sourceRepo in @($entries.source_repo | Sort-Object -Unique)) {
        $repoPath = Join-Path (Join-Path $RepoRoot 'agents\skills') $sourceRepo
        if (Test-Path -LiteralPath (Join-Path $repoPath '.git')) {
            $relative = "agents/skills/$sourceRepo"
            if ($moduleText -notmatch [regex]::Escape("path = $relative")) {
                $results += [pscustomobject]@{ target_name = "source:$sourceRepo"; classification = 'invalid'; reasons = @('missing-gitmodule-mapping') }
            }
        }
    }
}

$invalid = @($results | Where-Object { $_.classification -eq 'invalid' })
if ($Json) {
    [pscustomobject]@{ entries = $results } | ConvertTo-Json -Depth 6
    if ($invalid) {
        foreach ($result in $invalid) {
            [Console]::Error.WriteLine(("{0}: {1}" -f $result.target_name, ($result.reasons -join ',')))
        }
        exit 1
    }
    exit 0
}

$results | Format-Table -AutoSize
if ($invalid) { exit 1 }

& (Join-Path $PSScriptRoot 'sync-agent-skills.ps1') -RepoRoot $RepoRoot -HermesSkillsRoot $HermesSkillsRoot -Check
if (-not $?) { exit 1 }
Write-Output 'verification-complete'
