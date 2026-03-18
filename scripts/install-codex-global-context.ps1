$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot "codex\global\AGENTS.md"
$targetDir = Join-Path $HOME ".codex"
$targetPath = Join-Path $targetDir "AGENTS.md"

if (-not (Test-Path $sourcePath)) {
    throw "Source file not found: $sourcePath"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

if (Test-Path $targetPath) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = Join-Path $targetDir ("AGENTS.backup-" + $timestamp + ".md")
    Copy-Item -Path $targetPath -Destination $backupPath -Force
    Write-Host "Backed up existing AGENTS.md to $backupPath"
}

Copy-Item -Path $sourcePath -Destination $targetPath -Force

Write-Host "Installed Codex global context:"
Write-Host "  Source: $sourcePath"
Write-Host "  Target: $targetPath"
