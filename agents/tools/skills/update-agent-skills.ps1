param(
    [string]$RepoRoot,
    [switch]$Json
)

. (Join-Path $PSScriptRoot 'agent-skills.common.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Get-AgentSkillsRepoRoot
}

$manifestPath = Join-Path $RepoRoot 'agents\skills-manifest.yaml'
$entries = Read-AgentSkillsManifest -ManifestPath $manifestPath
$repos = $entries |
    Where-Object { $_.status -in @('active', 'experimental') } |
    Select-Object -ExpandProperty source_repo -Unique

$results = @()

foreach ($repoName in $repos) {
    $repoPath = Join-Path (Join-Path $RepoRoot 'agents\skills') $repoName
    if (-not (Test-Path $repoPath)) {
        $results += [pscustomobject]@{ repo = $repoName; status = 'update-failed'; reason = 'missing-repo' }
        continue
    }

    $branchOutput = & git -C $repoPath rev-parse --abbrev-ref HEAD 2>$null
    $branch = if ($null -eq $branchOutput) {
        ''
    }
    else {
        ($branchOutput | Out-String).Trim()
    }
    $dirty = (& git -C $repoPath status --porcelain 2>$null)

    if (-not $branch -or $branch -eq 'HEAD') {
        $results += [pscustomobject]@{ repo = $repoName; status = 'update-skipped'; reason = 'detached-head' }
        continue
    }

    if ($dirty) {
        $results += [pscustomobject]@{ repo = $repoName; status = 'update-skipped'; reason = 'dirty-worktree' }
        continue
    }

    & git -C $repoPath pull --ff-only | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $results += [pscustomobject]@{ repo = $repoName; status = 'update-failed'; reason = 'git-pull-failed' }
        continue
    }

    $results += [pscustomobject]@{ repo = $repoName; status = 'updated'; reason = 'fast-forwarded-or-current' }
}

if ($Json) {
    $results | ConvertTo-Json -Depth 4
}
else {
    $results | Format-Table -AutoSize
}
