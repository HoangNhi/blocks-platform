[CmdletBinding()]
param(
    [switch]$WithVault,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ClaudeArguments
)

$command = Get-Command claude -ErrorAction Stop
$arguments = [System.Collections.Generic.List[string]]::new()
if ($WithVault) {
    if (-not $env:OBSIDIAN_VAULT_PATH -or -not (Test-Path -LiteralPath $env:OBSIDIAN_VAULT_PATH -PathType Container)) {
        throw 'OBSIDIAN_VAULT_PATH must reference an existing directory when -WithVault is used'
    }
    $arguments.Add('--add-dir')
    $arguments.Add([System.IO.Path]::GetFullPath($env:OBSIDIAN_VAULT_PATH))
}
foreach ($argument in @($ClaudeArguments)) { $arguments.Add($argument) }
& $command.Source @arguments
exit $LASTEXITCODE
