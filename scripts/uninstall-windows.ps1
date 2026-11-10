# SPDX-License-Identifier: AGPL-3.0-only
# Remove both integrations before delegating native resource removal.
param([switch]$Interactive)
$ErrorActionPreference='Stop'
try {
  if (Get-Process -Name 'CrossPet','CrossPet Plus','Clawd on Desk' -ErrorAction SilentlyContinue) {
    throw 'Quit CrossPet / CrossPet Plus / Clawd on Desk from their tray menus first.'
  }
  $root=Join-Path $env:LOCALAPPDATA 'Programs\CrossPet'
  $runtime=Join-Path $root 'runtime\CrossPet Plus.exe'
  $cleanup=Join-Path $root 'runtime\resources\app.asar.unpacked\hooks\cleanup-integrations.js'
  if ((Test-Path -LiteralPath $runtime) -and (Test-Path -LiteralPath $cleanup)) {
    $previous=$env:ELECTRON_RUN_AS_NODE
    try {
      $env:ELECTRON_RUN_AS_NODE='1'
      & $runtime $cleanup --apply
      if ($LASTEXITCODE -ne 0) { throw 'Backend integration cleanup failed; installation retained.' }
    } finally {
      if ($null -eq $previous) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
      else { $env:ELECTRON_RUN_AS_NODE=$previous }
    }
  }
  $nativeUninstall=Join-Path $PSScriptRoot 'uninstall-upstream.ps1'
  if (-not (Test-Path -LiteralPath $nativeUninstall)) { throw 'Missing native uninstaller.' }
  $text=[IO.File]::ReadAllText($nativeUninstall)
  # Original upstream removal remains intact, with forced process termination
  # replaced by a stop-before-uninstall guard in the packaged copy.
  & ([scriptblock]::Create($text)) -Interactive:$Interactive
} catch {
  Write-Error $_
  exit 1
}
