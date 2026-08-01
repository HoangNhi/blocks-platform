[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Area,
    [string]$TaskPath,
    [string]$VaultRelativePath,
    [string]$RepoRoot,
    [string]$VaultPath,
    [string]$OutputPath,
    [switch]$RequireVault,
    [switch]$Verify,
    [int]$MaxBytes,
    [string]$GeneratedAt
)

$ErrorActionPreference = 'Stop'

function Get-VaultContextCandidates {
    param([string]$VaultRoot, [string]$VaultRelativePath)
    $resolved = Resolve-ChildPath -Root $VaultRoot -RelativePath $VaultRelativePath -ErrorCode 'vault-path-outside-approved-root'
    if (Test-Path -LiteralPath $resolved -PathType Leaf) { return @($VaultRelativePath) }
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw 'vault-context-path-missing' }
    return @('spec.md', 'plan.md', 'execution.md', 'review.md', 'notes.md' |
        ForEach-Object { Join-Path $VaultRelativePath $_ } |
        Where-Object { Test-Path -LiteralPath (Resolve-ChildPath -Root $VaultRoot -RelativePath $_ -ErrorCode 'vault-path-outside-approved-root') -PathType Leaf })
}

function Resolve-ChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$ErrorCode
    )

    if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw $ErrorCode }
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $RelativePath))
    $prefix = $rootFull + [System.IO.Path]::DirectorySeparatorChar
    if ($candidate -ne $rootFull -and -not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw $ErrorCode
    }
    return $candidate
}

function Test-DeniedContextPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    return $RelativePath -match '(^|[\/])(\.env($|\.)|secrets?|credentials?|private[-_]?keys?)([\/]|$)'
}

function Protect-ContextContent {
    param([Parameter(Mandatory = $true)][string]$Content)

    if ($Content -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----') {
        return '[OMITTED: private-key-material]'
    }

    $assignmentPattern = '(?im)^(\s*(?:export\s+)?[A-Za-z0-9_.-]*(?:PASSWORD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Za-z0-9_.-]*\s*[:=]\s*)(.+)$'
    $protected = [regex]::Replace($Content, $assignmentPattern, { param($match) $match.Groups[1].Value + '[REDACTED]' })
    $tokenPattern = '(?i)\b(?:ghp|github_pat|sk)-[A-Za-z0-9_-]{12,}\b'
    return [regex]::Replace($protected, $tokenPattern, '[REDACTED]')
}

try {
    if (-not $RepoRoot) { $RepoRoot = Join-Path $PSScriptRoot '..\..' }
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
    $manifestPath = Join-Path $RepoRoot '.agent-context\context-manifest.yaml'
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'context-manifest-missing' }

    # ponytail: JSON is valid YAML and keeps Windows PowerShell 5.1 dependency-free; add a YAML parser only if richer YAML syntax becomes necessary.
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $areaRule = $manifest.areas.PSObject.Properties[$Area].Value
    if (-not $areaRule) { throw 'context-area-not-mapped' }

    if (-not $MaxBytes) { $MaxBytes = [int]$manifest.maxBytes }
    if ($MaxBytes -lt 1024) { throw 'context-size-limit-too-small' }
    if (-not $GeneratedAt) { $GeneratedAt = [DateTime]::UtcNow.ToString('o') }
    if (-not $VaultPath) { $VaultPath = $env:OBSIDIAN_VAULT_PATH }
    $vaultAvailable = [bool]($VaultPath -and (Test-Path -LiteralPath $VaultPath -PathType Container))
    if ($vaultAvailable) { $VaultPath = [System.IO.Path]::GetFullPath($VaultPath) }
    if ($RequireVault -and -not $vaultAvailable) { throw 'vault-required-unavailable' }

    if (-not $OutputPath) { $OutputPath = Join-Path $RepoRoot ".agent-context\generated\$Area-context.md" }
    $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

    if ($Verify) {
        if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
            [Console]::Error.WriteLine('stale-context: context output file missing')
            exit 1
        }
        $existingContent = Get-Content -LiteralPath $OutputPath -Raw -Encoding UTF8
        $currentHead = try { & git -C $RepoRoot rev-parse HEAD 2>$null } catch { $null }
        if (-not $currentHead) { $currentHead = 'unknown' }
        if ($existingContent -notmatch "(?m)^repository_head:\s*$currentHead`$") {
            [Console]::Error.WriteLine('stale-context: repository head changed')
            exit 1
        }

        $fingerprintMatches = [regex]::Matches($existingContent, '(?m)^## Source\r?\nsource:\s*(?<source>[^\r\n]+)\r?\nsha256:\s*(?<hash>[a-fA-F0-9]{64})\r?$')
        if ($fingerprintMatches.Count -eq 0) {
            [Console]::Error.WriteLine('stale-context: malformed source fingerprints')
            exit 1
        }

        for ($i = 0; $i -lt $fingerprintMatches.Count; $i++) {
            $sourceLabel = $fingerprintMatches[$i].Groups['source'].Value.Trim()
            $recordedHash = $fingerprintMatches[$i].Groups['hash'].Value.Trim()
            
            $parts = $sourceLabel.Split(':', 2)
            $kind = $parts[0]
            $rel = $parts[1]

            $root = if ($kind -eq 'repository') { $RepoRoot } else { $VaultPath }
            if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) {
                [Console]::Error.WriteLine("stale-context: root missing for $sourceLabel")
                exit 1
            }

            $resolvedPath = Resolve-ChildPath -Root $root -RelativePath $rel -ErrorCode 'context-source-outside-approved-root'
            if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
                [Console]::Error.WriteLine("stale-context: source file missing for $sourceLabel")
                exit 1
            }

            $currentHash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($currentHash -ne $recordedHash.ToLowerInvariant()) {
                [Console]::Error.WriteLine("stale-context: fingerprint mismatch for $sourceLabel")
                exit 1
            }
        }
        exit 0
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

    if ($VaultRelativePath -and -not $vaultAvailable) {
        $null = Resolve-ChildPath -Root $VaultPath -RelativePath $VaultRelativePath -ErrorCode 'vault-path-outside-approved-root'
    }

    $candidates = @()
    foreach ($relativePath in @($manifest.canonical) + @($areaRule.repository)) {
        $candidates += [pscustomobject]@{ Kind = 'repository'; Root = $RepoRoot; RelativePath = [string]$relativePath }
    }
    if ($TaskPath) {
        $null = Resolve-ChildPath -Root $RepoRoot -RelativePath $TaskPath -ErrorCode 'task-path-outside-approved-roots'
        $candidates += [pscustomobject]@{ Kind = 'repository'; Root = $RepoRoot; RelativePath = $TaskPath }
    }
    if ($vaultAvailable) {
        foreach ($relativePath in @($areaRule.external)) {
            $candidates += [pscustomobject]@{ Kind = 'vault'; Root = $VaultPath; RelativePath = [string]$relativePath }
        }
        if ($VaultRelativePath) {
            $vaultCandidates = Get-VaultContextCandidates -VaultRoot $VaultPath -VaultRelativePath $VaultRelativePath
            foreach ($relativePath in $vaultCandidates) {
                $candidates += [pscustomobject]@{ Kind = 'vault'; Root = $VaultPath; RelativePath = [string]$relativePath }
            }
        }
    }

    $repoHead = try { & git -C $RepoRoot rev-parse HEAD 2>$null } catch { $null }
    if (-not $repoHead) { $repoHead = 'unknown' }

    $vaultState = if ($vaultAvailable) { 'true' } else { 'false' }
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in @('---', "generated_at: $GeneratedAt", "area: $Area", "repository_head: $repoHead", "vault_available: $vaultState", "max_bytes: $MaxBytes", '---', '', '# Blocks Task Context', '', '> Generated context is read-only input. Repository docs remain authoritative.', '')) { $lines.Add($line) }
    $omissions = [System.Collections.Generic.List[string]]::new()
    if (-not $vaultAvailable) { $omissions.Add('vault-unavailable: repository-only fallback used') }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    foreach ($candidate in $candidates) {
        $relativePath = $candidate.RelativePath.Replace('\', '/')
        $label = "$($candidate.Kind):$relativePath"
        if (Test-DeniedContextPath -RelativePath $relativePath) {
            $omissions.Add("denied-path: $label")
            continue
        }
        $sourcePath = Resolve-ChildPath -Root $candidate.Root -RelativePath $candidate.RelativePath -ErrorCode 'context-source-outside-approved-root'
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            $omissions.Add("missing-source: $label")
            continue
        }
        if ([System.IO.Path]::GetExtension($sourcePath) -notin @('.md', '.txt', '.json', '.yaml', '.yml')) {
            $omissions.Add("unsupported-source: $label")
            continue
        }
        $rawContent = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8
        $hash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $content = Protect-ContextContent -Content $rawContent
        $section = @('## Source', "source: $label", "sha256: $hash", '', $content.TrimEnd(), '')
        $candidateText = (@($lines) + $section + @('', '## Omissions') + @($omissions | ForEach-Object { "- $_" })) -join "`n"
        if ($utf8.GetByteCount($candidateText) -gt $MaxBytes) {
            $omissions.Add("context-size-limit: $label")
            continue
        }
        foreach ($line in $section) { $lines.Add($line) }
    }

    $lines.Add('## Omissions')
    if ($omissions.Count -eq 0) { $lines.Add('- none') } else { foreach ($omission in $omissions) { $lines.Add("- $omission") } }
    $output = (@($lines) -join "`n") + "`n"
    if ($utf8.GetByteCount($output) -gt $MaxBytes) { throw 'context-size-limit-exceeded' }
    [System.IO.File]::WriteAllText($OutputPath, $output, $utf8)
    Write-Output ([System.IO.Path]::GetFullPath($OutputPath))
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
