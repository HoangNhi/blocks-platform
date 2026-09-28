param(
    [ValidateSet('docs', 'backend', 'ui-runtime')]
    [string]$Mode = 'docs',
    [string]$AppHostUrl,
    [string]$Route,
    [switch]$RequireBrowserEvidence,
    [string]$TaskPath,
    [string]$RunId,
    [string]$BrowserEvidencePath
)

$ErrorActionPreference = 'Stop'

function Complete-Verification {
    param([string]$Status, [string]$Reason, [string]$NextRerunAction)
    [pscustomobject]@{
        Status          = $Status
        Reason          = $Reason
        Affected        = $Route
        NextRerunAction = $NextRerunAction
    } | Format-List
    if ($Status -eq 'BLOCKED') {
        exit 1
    }
    exit 0
}

# mode check
if ($Mode -eq 'docs') {
    if ($RequireBrowserEvidence) {
        Complete-Verification -Status 'BLOCKED' -Reason 'Docs mode cannot require browser evidence' -NextRerunAction 'Remove -RequireBrowserEvidence or use ui-runtime mode'
    }
    Complete-Verification -Status 'NOT APPLICABLE' -Reason 'Task is documentation or workflow' -NextRerunAction ''
}

if (-not $AppHostUrl) {
    Complete-Verification -Status 'BLOCKED' -Reason 'Missing AppHostUrl to verify runtime' -NextRerunAction 'Provide AppHostUrl and rerun verify-runtime.ps1'
}

# uri check
$uri = $null
$isValidUri = [System.Uri]::TryCreate($AppHostUrl, [System.UriKind]::Absolute, [ref]$uri)
if (-not $isValidUri -or $uri.Scheme -notin @('http', 'https')) {
    Complete-Verification -Status 'BLOCKED' -Reason 'AppHostUrl must be a valid HTTP or HTTPS absolute URL' -NextRerunAction 'Provide a valid HTTP or HTTPS AppHostUrl'
}
if ($uri.UserInfo) {
    Complete-Verification -Status 'BLOCKED' -Reason 'AppHostUrl must not contain userinfo/credentials' -NextRerunAction 'Remove userinfo from AppHostUrl'
}

try {
    $response = Invoke-WebRequest -Uri $AppHostUrl -Method Head -TimeoutSec 10 -MaximumRedirection 0 -UseBasicParsing
    if ($response.StatusCode -ne 200) {
        Complete-Verification -Status 'BLOCKED' -Reason "HTTP $($response.StatusCode)" -NextRerunAction 'Ensure endpoint returns 200 OK'
    }
}
catch {
    Complete-Verification -Status 'BLOCKED' -Reason $_.Exception.Message -NextRerunAction 'Start AppHost or check endpoint, then rerun'
}

if ($Mode -eq 'backend' -and -not $RequireBrowserEvidence) {
    Complete-Verification -Status 'PASS' -Reason 'HTTP 200 backend liveness-only; Route unverified' -NextRerunAction ''
}

$separator = [System.IO.Path]::DirectorySeparatorChar
$pathComparison = if ($separator -eq '\') { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }

function Assert-NoReparsePoint {
    param([string]$Path)
    $ancestor = $Path
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                Complete-Verification -Status 'BLOCKED' -Reason 'Reparse point detected in evidence path' -NextRerunAction 'Use real files and directories without links'
            }
        }
        $parent = Split-Path -Path $ancestor -Parent
        if ($parent -eq $ancestor) { break }
        $ancestor = $parent
    }
}

if ([string]::IsNullOrWhiteSpace($TaskPath) -or [string]::IsNullOrWhiteSpace($RunId) -or [string]::IsNullOrWhiteSpace($Route)) {
    Complete-Verification -Status 'BLOCKED' -Reason 'Browser verification requires TaskPath, RunId and Route' -NextRerunAction 'Provide exact approved task, run and route even with BrowserEvidencePath'
}
$vaultPath = $env:OBSIDIAN_VAULT_PATH
if (-not $vaultPath -or -not (Test-Path -LiteralPath $vaultPath -PathType Container)) {
    Complete-Verification -Status 'BLOCKED' -Reason 'OBSIDIAN_VAULT_PATH is missing or inaccessible' -NextRerunAction 'Set valid OBSIDIAN_VAULT_PATH'
}
$vaultRoot = [System.IO.Path]::GetFullPath($vaultPath).TrimEnd('\', '/')
$segments = @($TaskPath -split '[\\/]')
if ([System.IO.Path]::IsPathRooted($TaskPath) -or $segments.Count -lt 2 -or @($segments | Where-Object { $_ -in @('', '.', '..') -or $_ -match ':' }).Count -gt 0) {
    Complete-Verification -Status 'BLOCKED' -Reason 'Invalid TaskPath' -NextRerunAction 'Provide valid vault-relative TaskPath without traversal'
}
if ($RunId -match '[^a-zA-Z0-9_\-]') {
    Complete-Verification -Status 'BLOCKED' -Reason 'Invalid RunId format' -NextRerunAction 'Provide valid alphanumeric RunId'
}
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $vaultRoot ($segments -join $separator))).TrimEnd('\', '/')
if (-not $taskRoot.StartsWith($vaultRoot + $separator, $pathComparison)) {
    Complete-Verification -Status 'BLOCKED' -Reason 'TaskPath escapes vault' -NextRerunAction 'Fix TaskPath'
}
$runDir = Join-Path (Join-Path $taskRoot 'evidence') $RunId
$reportPath = Join-Path $runDir 'browser.json'
if ($BrowserEvidencePath) {
    $reportPath = [System.IO.Path]::GetFullPath($BrowserEvidencePath)
}
if (-not $reportPath.StartsWith($runDir + $separator, $pathComparison)) {
    Complete-Verification -Status 'BLOCKED' -Reason 'Browser report escapes approved run directory' -NextRerunAction 'Keep report inside exact task evidence/run directory'
}
Assert-NoReparsePoint -Path $reportPath
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    Complete-Verification -Status 'BLOCKED' -Reason "Browser report not found at $reportPath" -NextRerunAction 'Generate browser report with browser-use before verification'
}

try {
    $rawJson = [System.IO.File]::ReadAllText($reportPath)
    $report = $rawJson | ConvertFrom-Json
} catch {
    Complete-Verification -Status 'BLOCKED' -Reason 'Browser report is invalid JSON' -NextRerunAction 'Fix browser.json structure'
}

if ($rawJson -notmatch '^\s*\{' -or $report -isnot [pscustomobject] -or $report.schemaVersion -isnot [ValueType] -or $report.schemaVersion -is [bool] -or $report.schemaVersion -ne 1) {
    Complete-Verification -Status 'BLOCKED' -Reason 'Browser report schemaVersion must be 1' -NextRerunAction 'Update report schemaVersion to 1'
}
if ($report.runId -isnot [string] -or $report.runId -cne $RunId) {
    Complete-Verification -Status 'BLOCKED' -Reason "report runId '$($report.runId)' does not match invocation '$RunId'" -NextRerunAction 'Ensure runId matches'
}
if ($report.appHostUrl -isnot [string] -or $report.appHostUrl -cne $AppHostUrl) {
    Complete-Verification -Status 'BLOCKED' -Reason "report appHostUrl '$($report.appHostUrl)' does not match input '$AppHostUrl'" -NextRerunAction 'Ensure appHostUrl matches'
}
if ($report.route -isnot [string] -or $report.route -cne $Route) {
    Complete-Verification -Status 'BLOCKED' -Reason "report route '$($report.route)' does not match input '$Route'" -NextRerunAction 'Ensure route matches'
}
if ($report.status -isnot [string] -or $report.status -cne 'PASS') {
    Complete-Verification -Status 'BLOCKED' -Reason "report status is '$($report.status)', expected PASS" -NextRerunAction 'Ensure all browser checks pass'
}

if ($report.checks -isnot [array] -or $report.artifacts -isnot [array]) {
    Complete-Verification -Status 'BLOCKED' -Reason 'checks and artifacts must be JSON arrays' -NextRerunAction 'Fix browser report schema'
}
$chkList = @($report.checks)
if ($chkList.Count -eq 0) {
    Complete-Verification -Status 'BLOCKED' -Reason 'report checks array is empty' -NextRerunAction 'Add at least one verification check'
}
foreach ($chk in $chkList) {
    if ($chk -isnot [pscustomobject] -or $chk.name -isnot [string] -or [string]::IsNullOrWhiteSpace($chk.name) -or $chk.status -isnot [string] -or $chk.status -cne 'PASS') {
        Complete-Verification -Status 'BLOCKED' -Reason "check '$($chk.name)' has status '$($chk.status)', not PASS" -NextRerunAction 'Fix failing check'
    }
}

$artList = @($report.artifacts)
if ($artList.Count -eq 0) {
    Complete-Verification -Status 'BLOCKED' -Reason 'report artifacts array is empty' -NextRerunAction 'Include at least one artifact file'
}
foreach ($art in $artList) {
    if ($art -isnot [string] -or [string]::IsNullOrWhiteSpace($art) -or [System.IO.Path]::IsPathRooted($art) -or @($art -split '[\\/]' | Where-Object { $_ -in @('', '.', '..') -or $_ -match ':' }).Count -gt 0) {
        Complete-Verification -Status 'BLOCKED' -Reason "artifact '$art' is rooted; must be relative" -NextRerunAction 'Use relative artifact paths'
    }
    $artFullPath = [System.IO.Path]::GetFullPath((Join-Path $runDir $art))
    if (-not $artFullPath.StartsWith($runDir + $separator, $pathComparison)) {
        Complete-Verification -Status 'BLOCKED' -Reason "artifact '$art' escapes run directory" -NextRerunAction 'Keep artifacts inside run directory'
    }
    if (-not (Test-Path -LiteralPath $artFullPath -PathType Leaf)) {
        Complete-Verification -Status 'BLOCKED' -Reason "artifact file '$art' does not exist" -NextRerunAction 'Ensure all referenced artifact files exist'
    }
    Assert-NoReparsePoint -Path $artFullPath
}

Complete-Verification -Status 'PASS' -Reason "HTTP 200 + browser report verified ($($chkList.Count) checks, $($artList.Count) artifacts)" -NextRerunAction ''
