param(
    [Parameter(Mandatory = $true)]
    [string]$TaskFolder,
    [ValidateSet('review', 'workflow-review', 'skill-backlog', 'migration-decision')]
    [string]$Kind = 'review'
)

$nameMap = @{
    'review' = 'review.md'
    'workflow-review' = 'workflow-review.md'
    'skill-backlog' = 'skill-backlog.md'
    'migration-decision' = 'migration-decision.md'
}

$fileName = $nameMap[$Kind]
$path = Join-Path $TaskFolder $fileName

if (-not (Test-Path $TaskFolder)) {
    throw "Task folder not found: $TaskFolder"
}

if (-not (Test-Path $path)) {
    $content = @"
# $fileName

## Summary

## Findings

## Verification

## Notes
"@
    Set-Content -Path $path -Encoding utf8 -Value $content
}

Write-Output $path
