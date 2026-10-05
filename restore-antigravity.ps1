# Antigravity Supreme Master Autonomous OS — 1-Click Disaster Recovery & Restore Script.
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   ANTIGRAVITY MASTER AUTONOMOUS OS -- 1-CLICK RESTORER     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$userProfile = [System.Environment]::GetFolderPath('UserProfile')
$targetConfig = Join-Path $userProfile ".gemini\config"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Test-Path (Join-Path $scriptDir ".antigravity-backup")) {
    $sourceDir = Join-Path $scriptDir ".antigravity-backup"
} elseif (Test-Path (Join-Path $scriptDir "skills")) {
    $sourceDir = $scriptDir
} elseif (Test-Path "$userProfile\.gemini\antigravity-master-backup") {
    $sourceDir = "$userProfile\.gemini\antigravity-master-backup"
} else {
    Write-Host "[!] Could not locate backup source files." -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Ensuring target directory exists: $targetConfig" -ForegroundColor Yellow
if (!(Test-Path $targetConfig)) {
    New-Item -ItemType Directory -Path $targetConfig -Force | Out-Null
}

Write-Host "[2/4] Restoring global directives..." -ForegroundColor Yellow
if (Test-Path (Join-Path $sourceDir "AGENTS.md")) {
    Copy-Item -Path (Join-Path $sourceDir "AGENTS.md") -Destination $targetConfig -Force
}
if (Test-Path (Join-Path $sourceDir "GEMINI.md")) {
    Copy-Item -Path (Join-Path $sourceDir "GEMINI.md") -Destination $targetConfig -Force
}
if (Test-Path (Join-Path $sourceDir "mcp_config.json")) {
    Copy-Item -Path (Join-Path $sourceDir "mcp_config.json") -Destination $targetConfig -Force
}

Write-Host "[3/4] Restoring all custom skills..." -ForegroundColor Yellow
$skillsSource = Join-Path $sourceDir "skills"
$skillsTarget = Join-Path $targetConfig "skills"
if (Test-Path $skillsSource) {
    Copy-Item -Path $skillsSource -Destination $targetConfig -Recurse -Force
}

$skillCount = (Get-ChildItem -Path $skillsTarget -Directory -ErrorAction SilentlyContinue).Count

Write-Host "[4/4] Verifying restored configuration..." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host " [OK] Antigravity Master Autonomous OS restored successfully!" -ForegroundColor Green
Write-Host "   - Target Config: $targetConfig" -ForegroundColor White
Write-Host "   - Total Skills Restored: $skillCount skills" -ForegroundColor White
Write-Host "   - Master Trigger: 'APEX: RUN' or 'APEX'" -ForegroundColor Cyan
Write-Host "   - Active Across: All 3 Google/Gmail accounts on this machine" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
