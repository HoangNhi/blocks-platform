param(
    [string]$RepoRoot,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'agent-skills.common.ps1')

if (-not $RepoRoot) { $RepoRoot = Get-AgentSkillsRepoRoot }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$lockPath = Join-Path $RepoRoot 'skills-lock.json'
$gitmodulesPath = Join-Path $RepoRoot '.gitmodules'

function Get-GitLinkCommits {
    param([string]$Root)

    $links = @{}
    $lines = @(git -C $Root ls-files --stage agents/skills)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read staged skill Git links' }
    foreach ($line in $lines) {
        if ($line -match '^160000\s+([0-9a-f]{40})\s+\d+\s+agents/skills/([^/]+)$') {
            $links[$matches[2]] = $matches[1]
        }
    }
    return $links
}

function Get-SubmoduleMetadata {
    param([string]$Root)

    $metadata = @{}
    $lines = @(git -C $Root config --file $gitmodulesPath --get-regexp '^submodule\..*\.url$')
    if ($LASTEXITCODE -ne 0) { throw 'Could not read .gitmodules URLs' }
    foreach ($line in $lines) {
        $parts = $line -split '\s+', 2
        $name = $parts[0] -replace '^submodule\.(.*)\.url$', '$1'
        $url = $parts[1]
        $path = (git -C $Root config --file $gitmodulesPath --get submodule.$name.path).Trim()
        if (-not $path -or $path -notmatch '^agents/skills/([^/]+)$') {
            throw ('Invalid skill submodule path: ' + $path)
        }
        $metadata[$matches[1]] = [pscustomobject]@{ url = $url; path = $path }
    }
    return $metadata
}

$gitLinks = Get-GitLinkCommits -Root $RepoRoot
$submodules = Get-SubmoduleMetadata -Root $RepoRoot
if ($gitLinks.Count -ne 8) { throw ('Expected eight skill Git links; found ' + $gitLinks.Count) }
foreach ($repoName in $gitLinks.Keys) {
    if (-not $submodules.ContainsKey($repoName)) { throw ('Missing .gitmodules entry: ' + $repoName) }
}

$lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($repository in $lock.repositories.PSObject.Properties) {
    $repoName = $repository.Name
    if (-not $gitLinks.ContainsKey($repoName)) { throw ('Lock repository has no Git link: ' + $repoName) }
    $repository.Value.commit = $gitLinks[$repoName]
    $repository.Value.url = $submodules[$repoName].url
}

foreach ($skill in $lock.skills.PSObject.Properties) {
    $value = $skill.Value
    $canonicalPath = $value.canonicalPath.Replace('/', '\')
    $skillPath = Join-Path $RepoRoot $canonicalPath
    $skillFile = Join-Path $skillPath 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skillFile)) { throw ('Missing canonical SKILL.md: ' + $value.canonicalPath) }
    $value.skillFileSha256 = (Get-FileHash -LiteralPath $skillFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($value.sourceType -eq 'gitlink') {
        if ($value.canonicalPath -notmatch '^agents/skills/([^/]+)/') {
            throw ('Cannot map skill to Git link: ' + $value.canonicalPath)
        }
        $sourceRepo = $matches[1]
        if (-not $gitLinks.ContainsKey($sourceRepo)) { throw ('Skill source has no Git link: ' + $sourceRepo) }
        $value.sourceCommit = $gitLinks[$sourceRepo]
    }
}

$expected = ($lock | ConvertTo-Json -Depth 20) + [Environment]::NewLine
$current = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8
if ($Check) {
    if ($current -cne $expected) { throw 'skills-lock.json drift detected' }
    Write-Output 'skills-lock-check: PASS'
    exit 0
}

Write-Utf8NoBomFile -Path $lockPath -Content $expected
Write-Output 'skills-lock-write: PASS'
