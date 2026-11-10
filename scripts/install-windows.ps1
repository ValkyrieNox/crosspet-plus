# SPDX-License-Identifier: AGPL-3.0-only
# Native CrossPet host + Clawd service. Never stop unrelated processes.
[CmdletBinding()]
param([string]$BuildDir = '', [switch]$Start, [switch]$Update)
$ErrorActionPreference = 'Stop'
if (-not $BuildDir) {
  $BuildDir = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'CrossPet.exe')) { $PSScriptRoot }
    else { Join-Path (Split-Path $PSScriptRoot -Parent) 'build\windows\CrossPet' }
}
$BuildDir = (Resolve-Path -LiteralPath $BuildDir).ProviderPath
foreach ($need in @('CrossPet.exe','VERSION','web','characters','integrations','python\python.exe','runtime\CrossPet Plus.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $BuildDir $need))) { throw "Incomplete combined build: $need" }
}
# A native self-update first asks the running host to quit. Allow that graceful
# shutdown to finish; if anything remains, stop installation without killing it.
$deadline = (Get-Date).AddSeconds($(if ($Update) { 12 } else { 0 }))
do {
  $running = @(Get-Process -Name 'Clawd on Desk','CrossPet Plus','CrossPet' -ErrorAction SilentlyContinue)
  if ($running.Count -eq 0) { break }
  if ((Get-Date) -ge $deadline) { throw 'Quit Clawd on Desk / CrossPet Plus / CrossPet from their tray menus before installing.' }
  Start-Sleep -Milliseconds 500
} while ($true)
$version = (Get-Content -Raw -LiteralPath (Join-Path $BuildDir 'VERSION')).Trim()
if ($version -notmatch '^[0-9A-Za-z.+-]+$') { throw 'Invalid package version.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$destination = Join-Path $env:LOCALAPPDATA 'Programs\CrossPet'
if ([IO.Path]::GetFullPath($destination) -eq [IO.Path]::GetFullPath($BuildDir)) { throw 'Run the installer from an extracted package, not the current installation.' }
$backup = Join-Path $env:LOCALAPPDATA "CrossPet Plus\backups\$stamp"
$staged = "$destination.new-$stamp"
$old = "$destination.old-$stamp"
New-Item -ItemType Directory -Force -Path $backup,$staged | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @{
  'crosspet-settings.json' = (Join-Path $env:LOCALAPPDATA 'CrossPet\settings.json')
  'crosspet-windows-apps.json' = (Join-Path $env:LOCALAPPDATA 'CrossPet\windows-apps.json')
  'clawd-prefs.json' = (Join-Path $env:APPDATA 'clawd-on-desk\clawd-prefs.json')
  'claude-settings.json' = (Join-Path $env:USERPROFILE '.claude\settings.json')
  'codex-config.toml' = (Join-Path $env:USERPROFILE '.codex\config.toml')
  'codex-hooks.json' = (Join-Path $env:USERPROFILE '.codex\hooks.json')
  'clawd-runtime.json' = (Join-Path $env:USERPROFILE '.clawd\runtime.json')
}
foreach ($name in $files.Keys) {
  if (Test-Path -LiteralPath $files[$name]) {
    Copy-Item -LiteralPath $files[$name] -Destination (Join-Path $backup $name)
    if ((Get-FileHash -LiteralPath $files[$name] -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $backup $name) -Algorithm SHA256).Hash) { throw "Backup mismatch: $name" }
  }
}
# Validate login ownership before touching the installation or its preferences.
$runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$run = Get-ItemProperty -LiteralPath $runPath -ErrorAction SilentlyContinue
$loginBackup = @{}
foreach ($name in @('CrossPet','com.clawd.on-desk','com.valkyrienox.crosspet-plus')) {
  $property = if ($run) { $run.PSObject.Properties[$name] } else { $null }
  if ($property) {
    $loginBackup[$name] = $property.Value
    if ([string]$property.Value -notmatch '\\(?:Clawd on Desk|CrossPet Plus|CrossPet)\.exe"?(?:\s|$)') { throw "Unexpected login entry: $name" }
  }
}
[IO.File]::WriteAllText((Join-Path $backup 'login-items.json'), ($loginBackup | ConvertTo-Json), $utf8)
$count = 0; $bytes = [long]0
foreach ($source in Get-ChildItem -LiteralPath $BuildDir -File -Recurse) {
  $relative = $source.FullName.Substring($BuildDir.TrimEnd('\').Length).TrimStart('\')
  $target = Join-Path $staged $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $source.FullName -Destination $target
  if ($source.Length -ne (Get-Item -LiteralPath $target).Length -or
      (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw "Copy integrity mismatch: $relative" }
  $count++; $bytes += $source.Length
}
$copied = @(Get-ChildItem -LiteralPath $staged -File -Recurse)
if ($copied.Count -ne $count -or ($copied | Measure-Object Length -Sum).Sum -ne $bytes) { throw 'Staging file count/size mismatch.' }
# Keep the previous complete installation for rollback. Do not delete it.
$hadOld = Test-Path -LiteralPath $destination
if ($hadOld) { Rename-Item -LiteralPath $destination -NewName (Split-Path $old -Leaf) }
try { Rename-Item -LiteralPath $staged -NewName (Split-Path $destination -Leaf) }
catch {
  if ($hadOld) { Rename-Item -LiteralPath $old -NewName (Split-Path $destination -Leaf) }
  throw
}
# Offline migration only. The running service's settings controller remains
# the sole live writer. Preserve unrelated preferences, WSL and SSH profiles.
$prefsPath = $files['clawd-prefs.json']
$prefs = if (Test-Path -LiteralPath $prefsPath) { Get-Content -Raw -Encoding UTF8 -LiteralPath $prefsPath | ConvertFrom-Json } else { [pscustomobject]@{} }
$loginEnabled = $loginBackup.ContainsKey('CrossPet') -or ($prefs.openAtLogin -eq $true)
$changes = @{ theme = 'clawd'; permissionAutomationMode = 'off'; destructiveActionReminder = $true }
foreach ($key in $changes.Keys) { $prefs | Add-Member -Force -NotePropertyName $key -NotePropertyValue $changes[$key] }
New-Item -ItemType Directory -Force -Path (Split-Path $prefsPath -Parent) | Out-Null
[IO.File]::WriteAllText($prefsPath, (($prefs | ConvertTo-Json -Depth 100) + "`n"), $utf8)
foreach ($name in @('com.clawd.on-desk','com.valkyrienox.crosspet-plus')) {
  if ($loginBackup.ContainsKey($name)) { Remove-ItemProperty -LiteralPath $runPath -Name $name }
}
$exe = Join-Path $destination 'CrossPet.exe'
if ($loginEnabled) {
  New-Item -Path $runPath -Force | Out-Null
  Set-ItemProperty -LiteralPath $runPath -Name 'CrossPet' -Value ('"' + $exe + '"')
}
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
  # Retire earlier duplicate launchers, preserving a verified backup. The old
  # Clawd application/data stay on disk; only its desktop/menu entry moves.
  foreach ($name in @('CrossPet Plus','Clawd on Desk')) {
    $oldLink = Join-Path $folder "$name.lnk"
    if (-not (Test-Path -LiteralPath $oldLink)) { continue }
    $oldShortcut = $shell.CreateShortcut($oldLink)
    $owned = [string]::Equals($oldShortcut.TargetPath, $exe, [StringComparison]::OrdinalIgnoreCase) -or
      ((Split-Path $oldShortcut.TargetPath -Leaf) -in @('Clawd on Desk.exe','CrossPet Plus.exe'))
    if (-not $owned -or $oldShortcut.Arguments) { Write-Warning "Unrecognized shortcut retained: $oldLink"; continue }
    $linkBackup = Join-Path $backup ((Split-Path $folder -Leaf) + '-' + $name + '.lnk')
    Copy-Item -LiteralPath $oldLink -Destination $linkBackup
    if ((Get-FileHash -LiteralPath $oldLink -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $linkBackup -Algorithm SHA256).Hash) { throw "Shortcut backup mismatch: $oldLink" }
    Remove-Item -LiteralPath $oldLink
  }
  $shortcut = $shell.CreateShortcut((Join-Path $folder 'CrossPet.lnk'))
  $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = $destination
  $shortcut.IconLocation = (Join-Path $destination 'AppIcon.ico'); $shortcut.Save()
}
$receipt = [ordered]@{
  version = $version; installedAt = $stamp; architecture = 'native-crosspet-with-clawd-service'
  destination = $destination; previousInstallation = $(if ($hadOld) { $old } else { $null })
  backup = $backup; copiedFiles = $count; copiedBytes = $bytes; sha256Checked = $true
  permissionAutomationMode = 'off'; destructiveActionReminder = $true
}
[IO.File]::WriteAllText((Join-Path $backup 'installation.json'), ($receipt | ConvertTo-Json), $utf8)
$receipt | ConvertTo-Json -Compress
if ($Start -or $Update -or $PSScriptRoot -eq $BuildDir) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $exe -WorkingDirectory $destination
}
