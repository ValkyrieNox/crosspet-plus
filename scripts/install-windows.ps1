# SPDX-License-Identifier: AGPL-3.0-only
# Install an unpacked build without deleting the original Clawd application.
[CmdletBinding()]
param(
  [string]$BuildDir = '',
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
if (-not $BuildDir) { $BuildDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'desktop\dist\win-unpacked' }
if (Get-Process -Name 'Clawd on Desk','CrossPet Plus' -ErrorAction SilentlyContinue) {
  throw 'Quit Clawd on Desk / CrossPet Plus from its tray menu before installing.'
}
$BuildDir = (Resolve-Path -LiteralPath $BuildDir).ProviderPath
if (-not (Test-Path -LiteralPath (Join-Path $BuildDir 'CrossPet Plus.exe'))) {
  throw 'Build the Windows application first: npm run build:win:dir'
}
$package = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\desktop\package.json') | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^[0-9A-Za-z.+-]+$') { throw 'Invalid package version.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $env:LOCALAPPDATA "Programs\CrossPet Plus\$version"
$backup = Join-Path $env:LOCALAPPDATA "CrossPet Plus\backups\$stamp"
if (Test-Path -LiteralPath $destination) {
  $existingExe = Join-Path $destination 'CrossPet Plus.exe'
  if (-not (Test-Path -LiteralPath $existingExe) -or
      (Get-FileHash -LiteralPath $existingExe -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath (Join-Path $BuildDir 'CrossPet Plus.exe') -Algorithm SHA256).Hash) {
    throw "Different build already occupies $destination; use a new package version."
  }
}
New-Item -ItemType Directory -Force -Path $backup,$destination | Out-Null

# Back up only the configuration this runtime may synchronize. Never print it.
$files = @{
  'clawd-prefs.json' = (Join-Path $env:APPDATA 'clawd-on-desk\clawd-prefs.json')
  'claude-settings.json' = (Join-Path $env:USERPROFILE '.claude\settings.json')
  'codex-config.toml' = (Join-Path $env:USERPROFILE '.codex\config.toml')
  'codex-hooks.json' = (Join-Path $env:USERPROFILE '.codex\hooks.json')
  'clawd-runtime.json' = (Join-Path $env:USERPROFILE '.clawd\runtime.json')
}
foreach ($name in $files.Keys) {
  if (Test-Path -LiteralPath $files[$name]) {
    Copy-Item -LiteralPath $files[$name] -Destination (Join-Path $backup $name)
  }
}
$count = 0
$bytes = [long]0
foreach ($source in Get-ChildItem -LiteralPath $BuildDir -File -Recurse) {
  $relative = $source.FullName.Substring($BuildDir.TrimEnd('\').Length).TrimStart('\')
  $target = Join-Path $destination $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $source.FullName -Destination $target -Force
  if ($source.Length -ne (Get-Item -LiteralPath $target).Length -or
      (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) {
    throw "Copy integrity check failed: $relative"
  }
  $count++
  $bytes += $source.Length
}

# Offline migration only: the running app's settings controller remains the
# sole writer after startup. Keep every unrelated preference and SSH profile.
$prefsPath = $files['clawd-prefs.json']
$prefs = if (Test-Path -LiteralPath $prefsPath) {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $prefsPath | ConvertFrom-Json
} else { [pscustomobject]@{} }
$changes = @{ theme = 'crosspet-auto'; permissionAutomationMode = 'off'; destructiveActionReminder = $true }
foreach ($key in $changes.Keys) { $prefs | Add-Member -Force -NotePropertyName $key -NotePropertyValue $changes[$key] }
New-Item -ItemType Directory -Force -Path (Split-Path $prefsPath -Parent) | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($prefsPath, (($prefs | ConvertTo-Json -Depth 100) + "`n"), $utf8)

$exe = Join-Path $destination 'CrossPet Plus.exe'
# Carry the previous login preference over to the new application identity.
# Back up the exact managed values before removing the old competing entry.
$runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$run = Get-ItemProperty -LiteralPath $runPath -ErrorAction SilentlyContinue
$loginBackup = @{}
foreach ($name in @('com.clawd.on-desk','com.valkyrienox.crosspet-plus')) {
  $property = if ($run) { $run.PSObject.Properties[$name] } else { $null }
  if ($property) {
    $loginBackup[$name] = $property.Value
    if ([string]$property.Value -notmatch '\\(?:Clawd on Desk|CrossPet Plus)\.exe"?(?:\s|$)') {
      throw "Unexpected login entry for $name; refusing to change it."
    }
  }
}
[System.IO.File]::WriteAllText((Join-Path $backup 'login-items.json'), ($loginBackup | ConvertTo-Json), $utf8)
foreach ($name in $loginBackup.Keys) { Remove-ItemProperty -LiteralPath $runPath -Name $name }
if ($prefs.openAtLogin -eq $true) {
  New-Item -Path $runPath -Force | Out-Null
  Set-ItemProperty -LiteralPath $runPath -Name 'com.valkyrienox.crosspet-plus' -Value ('"' + $exe + '"')
}
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $shortcut = $shell.CreateShortcut((Join-Path $folder 'CrossPet Plus.lnk'))
  $shortcut.TargetPath = $exe
  $shortcut.WorkingDirectory = $destination
  $shortcut.IconLocation = (Join-Path $destination 'resources\icon.ico')
  $shortcut.Save()
}
$receipt = [ordered]@{
  version = $version; installedAt = $stamp; destination = $destination
  backup = $backup; copiedFiles = $count; copiedBytes = $bytes; sha256Checked = $true
  theme = 'crosspet-auto'; permissionAutomationMode = 'off'; destructiveActionReminder = $true
}
[System.IO.File]::WriteAllText((Join-Path $backup 'installation.json'), ($receipt | ConvertTo-Json), $utf8)
$receipt | ConvertTo-Json -Compress
if ($Start) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $exe -WorkingDirectory $destination
}
