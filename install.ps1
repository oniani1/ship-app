$ErrorActionPreference = "Stop"

$INSTALL_DIR = "$env:USERPROFILE\.ship-app"
$COMMANDS_DIR = "$env:USERPROFILE\.claude\commands"
$AGENTS_DIR = "$env:USERPROFILE\.claude\agents"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== ship-app installer ===" -ForegroundColor Cyan
Write-Host ""

# Check for Node.js
try {
    $nodeVersion = (node -v) -replace 'v', ''
    $major = [int]($nodeVersion.Split('.')[0])
    if ($major -lt 18) {
        Write-Host "ERROR: Node.js 18+ required. Current: v$nodeVersion" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Node.js is required. Install it from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check for Claude Code
if (-not (Test-Path "$env:USERPROFILE\.claude")) {
    Write-Host "WARNING: ~/.claude directory not found. Is Claude Code installed?" -ForegroundColor Yellow
    Write-Host "Install Claude Code first: https://claude.ai/code"
    exit 1
}

# Verify source files exist
if (-not (Test-Path "$ScriptDir\commands\ship-app.md")) {
    Write-Host "ERROR: Source files not found. Run this from within the ship-app repo." -ForegroundColor Red
    exit 1
}

# Backup config if updating
$configBackup = $null
if (Test-Path "$INSTALL_DIR\config.json") {
    Write-Host "Updating existing installation..."
    $configBackup = Get-Content "$INSTALL_DIR\config.json" -Raw
}

# Install files
Write-Host "Installing to $INSTALL_DIR..."
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null

# Copy each subdirectory explicitly (avoids nested-directory bug)
foreach ($dir in @("commands", "agents", "scripts", "templates")) {
    $src = Join-Path $ScriptDir $dir
    $dst = Join-Path $INSTALL_DIR $dir
    if (Test-Path $src) {
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        Copy-Item -Path $src -Destination $dst -Recurse -Force
    }
}

# Restore config backup
if ($configBackup) {
    Set-Content -Path "$INSTALL_DIR\config.json" -Value $configBackup
    Write-Host "  Preserved existing config.json"
}

# Install Node.js dependencies
Write-Host ""
Write-Host "Installing dependencies..."
try {
    Push-Location "$INSTALL_DIR\scripts"
    npm install --production
} finally {
    Pop-Location
}

# Create Claude Code directories
New-Item -ItemType Directory -Force -Path $COMMANDS_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $AGENTS_DIR | Out-Null

# Copy skill file
Write-Host ""
Write-Host "Copying skill file..."
Copy-Item -Force "$INSTALL_DIR\commands\ship-app.md" "$COMMANDS_DIR\ship-app.md"
Write-Host "  Installed: $COMMANDS_DIR\ship-app.md"

# Copy agent files
Write-Host "Copying agent files..."
Get-ChildItem "$INSTALL_DIR\agents\*.md" | ForEach-Object {
    Copy-Item -Force $_.FullName "$AGENTS_DIR\$($_.Name)"
    Write-Host "  Installed: $AGENTS_DIR\$($_.Name)"
}

Write-Host ""
Write-Host "=== Installation complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open Claude Code"
Write-Host "  2. Run /ship-app to get started"
Write-Host "  3. First run will guide you through configuration (API keys, etc.)"
Write-Host ""
Write-Host "Configuration is stored in: $INSTALL_DIR\config.json"
Write-Host "To reconfigure: node $INSTALL_DIR\scripts\config.mjs --init"
