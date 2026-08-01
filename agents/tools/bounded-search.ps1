param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Pattern,
    [int]$MaxCount = 20,
    [int]$Context = 2,
    [string[]]$Glob
)

if (-not (Test-Path $Root)) {
    throw "Root not found: $Root"
}

$command = @(
    'rg',
    '--line-number',
    '--color', 'never',
    '--max-count', $MaxCount,
    '--context', $Context
)

if ($Glob) {
    foreach ($item in $Glob) {
        $command += @('--glob', $item)
    }
}

$command += @($Pattern, $Root)

& $command[0] $command[1..($command.Count - 1)]
