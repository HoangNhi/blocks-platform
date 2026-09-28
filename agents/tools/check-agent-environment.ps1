param(
    [string]$TaskPath,
    [switch]$RequireTaskContext,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$separator = [System.IO.Path]::DirectorySeparatorChar
$pathComparison = if ($separator -eq '\') { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }

# 1. Vault State
$vaultProcess = $env:OBSIDIAN_VAULT_PATH
$vaultUser = [Environment]::GetEnvironmentVariable('OBSIDIAN_VAULT_PATH', 'User')

$vaultState = 'Missing'
if ([string]::IsNullOrWhiteSpace($vaultProcess) -and [string]::IsNullOrWhiteSpace($vaultUser)) {
    $vaultState = 'Missing'
} elseif (-not [string]::IsNullOrWhiteSpace($vaultUser) -and -not [string]::IsNullOrWhiteSpace($vaultProcess) -and $vaultProcess -ne $vaultUser) {
    $vaultState = 'StaleProcess'
} elseif ([string]::IsNullOrWhiteSpace($vaultProcess) -and -not [string]::IsNullOrWhiteSpace($vaultUser)) {
    $vaultState = 'StaleProcess'
} elseif (-not [string]::IsNullOrWhiteSpace($vaultProcess)) {
    if (Test-Path -LiteralPath $vaultProcess -PathType Container) {
        $vaultState = 'Ready'
    } else {
        $vaultState = 'Inaccessible'
    }
}

# 2. Task State
$taskState = 'NotRequested'
if ($PSBoundParameters.ContainsKey('TaskPath') -and -not [string]::IsNullOrEmpty($TaskPath)) {
    $segments = @($TaskPath -split '[\\/]')
    $isInvalid = $false
    if ([System.IO.Path]::IsPathRooted($TaskPath) -or $segments.Count -lt 2) {
        $isInvalid = $true
    }
    foreach ($seg in $segments) {
        if ([string]::IsNullOrWhiteSpace($seg) -or $seg -in @('.', '..') -or
            $seg -match '[<>:"|?*]' -or $seg.EndsWith('.') -or $seg.EndsWith(' ') -or
            $seg -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {
            $isInvalid = $true
            break
        }
    }

    if ($isInvalid -or [string]::IsNullOrWhiteSpace($vaultProcess) -or -not (Test-Path -LiteralPath $vaultProcess -PathType Container)) {
        $taskState = 'MissingTaskPath'
    } else {
        $vaultRoot = [System.IO.Path]::GetFullPath($vaultProcess).TrimEnd('\', '/')
        $targetPath = [System.IO.Path]::GetFullPath((Join-Path $vaultRoot ($segments -join $separator))).TrimEnd('\', '/')
        if (-not $targetPath.StartsWith($vaultRoot + $separator, $pathComparison)) {
            $taskState = 'MissingTaskPath'
        } else {
            $isReparse = $false
            $ancestor = $targetPath
            while ($ancestor -and $ancestor.Length -ge $vaultRoot.Length) {
                if (Test-Path -LiteralPath $ancestor) {
                    $item = Get-Item -LiteralPath $ancestor -Force
                    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                        $isReparse = $true
                        break
                    }
                }
                $ancestor = Split-Path -Path $ancestor -Parent
            }

            if ($isReparse -or -not (Test-Path -LiteralPath $targetPath -PathType Container)) {
                $taskState = 'MissingTaskPath'
            } else {
                $required = @('spec.md', 'plan.md', 'execution.md')
                $missingArt = $false
                foreach ($art in $required) {
                    $artFile = Join-Path $targetPath $art
                    if (-not (Test-Path -LiteralPath $artFile -PathType Leaf)) {
                        $missingArt = $true
                        break
                    }
                }
                if ($missingArt) {
                    $taskState = 'MissingArtifacts'
                } else {
                    $taskState = 'Ready'
                }
            }
        }
    }
} elseif ($PSBoundParameters.ContainsKey('TaskPath') -and [string]::IsNullOrEmpty($TaskPath)) {
    $taskState = 'MissingTaskPath'
}

# 3. Tool Probes
$toolAllowlist = [ordered]@{
    'git'         = '--version'
    'rg'          = '--version'
    'dotnet'      = '--version'
    'node'        = '--version'
    'npm'         = '--version'
    'uv'          = '--version'
    'python'      = '--version'
    'docker'      = '--version'
    'browser-use' = '--help'
    'gh'          = '--version'
}

$tools = [ordered]@{}
foreach ($name in $toolAllowlist.Keys) {
    $arg = $toolAllowlist[$name]
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        $tools[$name] = [ordered]@{ State = 'Missing'; Path = $null }
        continue
    }

    $toolPath = if ($cmd.Source -is [array]) { $cmd.Source[0] } else { $cmd.Source }
    if (-not $toolPath) {
        $toolPath = $cmd.Path
    }

    $state = 'Present'
    try {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        if ($toolPath.EndsWith('.cmd', [System.StringComparison]::OrdinalIgnoreCase) -or $toolPath.EndsWith('.bat', [System.StringComparison]::OrdinalIgnoreCase)) {
            $psi.FileName = if ($env:COMSPEC) { $env:COMSPEC } else { 'cmd.exe' }
            $psi.Arguments = "/d /c `"$toolPath`" $arg"
        } elseif ($toolPath.EndsWith('.ps1', [System.StringComparison]::OrdinalIgnoreCase)) {
            $psi.FileName = 'powershell.exe'
            $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$toolPath`" $arg"
        } else {
            $psi.FileName = $toolPath
            $psi.Arguments = $arg
        }
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $proc = [System.Diagnostics.Process]::Start($psi)
        if ($proc.WaitForExit(10000)) {
            if ($proc.ExitCode -eq 0) {
                $state = 'Runnable'
            } else {
                $state = 'Present'
            }
        } else {
            $proc.Kill()
            $state = 'Present'
        }
    } catch {
        $state = 'Present'
    }

    $tools[$name] = [ordered]@{ State = $state; Path = $toolPath }
}

# uv Python fallback
$uvPythonFallback = $null
$uvCmd = Get-Command 'uv' -ErrorAction SilentlyContinue
if ($uvCmd) {
    try {
        $uvPath = if ($uvCmd.Source -is [array]) { $uvCmd.Source[0] } else { $uvCmd.Source }
        if (-not $uvPath) { $uvPath = $uvCmd.Path }
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $uvPath
        $psi.Arguments = 'python find 3.12'
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        if ($proc.WaitForExit(10000) -and $proc.ExitCode -eq 0) {
            $pyFound = ($proc.StandardOutput.ReadToEnd()).Trim()
            if ($pyFound) {
                $uvPythonFallback = [ordered]@{ State = 'Runnable'; Path = $pyFound }
            }
        }
    } catch {}
}
if ($uvPythonFallback) {
    $tools['uvPython'] = $uvPythonFallback
}

$resultObj = [pscustomobject]@{
    VaultProcess = $vaultProcess
    VaultUser    = $vaultUser
    VaultState   = $vaultState
    TaskState    = $taskState
    Tools        = $tools
}

if ($Json) {
    $resultObj | ConvertTo-Json -Depth 5
} else {
    $resultObj
}

if ($RequireTaskContext) {
    if ($vaultState -ne 'Ready' -or $taskState -ne 'Ready') {
        exit 1
    }
}
exit 0
