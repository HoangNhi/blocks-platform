function Get-AgentSkillsRepoRoot {
    param([string]$StartPath = $PSScriptRoot)

    $gitRoot = & git -C $StartPath rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitRoot) {
        return (Resolve-Path -LiteralPath (($gitRoot | Out-String).Trim())).Path
    }

    return (Resolve-Path (Join-Path $StartPath '..\..\..')).Path
}

function Convert-AgentSkillsScalar {
    param([string]$Key, [string]$Value)

    $trimmed = $Value.Trim()
    if ($Key -eq 'targets') {
        if (-not $trimmed) { return @() }
        return @($trimmed.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    return $trimmed
}

function Read-AgentSkillsManifest {
    param([Parameter(Mandatory = $true)][string]$ManifestPath)

    $entries = @()
    $current = $null
    $inEntries = $false
    foreach ($rawLine in [System.IO.File]::ReadAllLines($ManifestPath)) {
        $line = $rawLine.TrimEnd()
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -eq 'entries:') { $inEntries = $true; continue }
        if (-not $inEntries) { continue }
        if ($trimmed.StartsWith('- ')) {
            if ($null -ne $current) { $entries += [pscustomobject]$current }
            $current = [ordered]@{}
            $parts = $trimmed.Substring(2).Split(':', 2)
            $current[$parts[0].Trim()] = Convert-AgentSkillsScalar -Key $parts[0].Trim() -Value $parts[1]
            continue
        }
        if ($null -ne $current -and $line -match '^\s{4}([^:]+):\s*(.*)$') {
            $key = $matches[1].Trim()
            $current[$key] = Convert-AgentSkillsScalar -Key $key -Value $matches[2]
        }
    }
    if ($null -ne $current) { $entries += [pscustomobject]$current }
    return $entries
}

function Get-AgentSkillSourceRoot {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][pscustomobject]$Entry
    )

    return (Join-Path (Join-Path (Join-Path $RepoRoot 'agents\skills') $Entry.source_repo) $Entry.source_skill_path)
}

function Write-Utf8NoBomFile {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Set-AgentSkillNameInFile {
    param(
        [Parameter(Mandatory = $true)][string]$SkillMarkdownPath,
        [Parameter(Mandatory = $true)][string]$TargetName
    )

    $content = Get-Content -LiteralPath $SkillMarkdownPath -Raw -Encoding UTF8
    $updated = [regex]::Replace($content, '(?ms)^---\s*\r?\nname:\s*.*?\r?\n', "---`r`nname: $TargetName`r`n")
    Write-Utf8NoBomFile -Path $SkillMarkdownPath -Content $updated
}

function Get-AgentSkillTreeHash {
    param([Parameter(Mandatory = $true)][string]$Root)

    if (-not (Test-Path -LiteralPath $Root)) { return '' }
    $resolved = (Resolve-Path -LiteralPath $Root).Path
    $lines = Get-ChildItem -LiteralPath $resolved -Recurse -Force -File |
        Where-Object { $_.FullName -notmatch '\\__pycache__\\' -and $_.Extension -ne '.pyc' } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($resolved.Length).TrimStart('\').Replace('\', '/')
            "$relative|$($_.Length)|$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
        }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '') }
    finally { $sha.Dispose() }
}
