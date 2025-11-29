# Helper script for creating releases on Windows
# Usage: .\scripts\release.ps1 [patch|minor|major]

param(
    [Parameter(Position=0)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$VersionType = 'patch'
)

# Colors for output
function Write-Info { Write-Host "ℹ $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "✗ $args" -ForegroundColor Red }

# Get current version
$currentVersion = (Get-Content package.json | ConvertFrom-Json).version
Write-Info "Current version: $currentVersion"

# Check for uncommitted changes
$gitStatus = git status -s
if ($gitStatus) {
    Write-Warn "You have uncommitted changes:"
    git status -s
    Write-Host ""
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        exit 1
    }
}

# Run tests
Write-Info "Running tests..."
npm test

if ($LASTEXITCODE -ne 0) {
    Write-Err "Tests failed! Fix errors before releasing."
    exit 1
}

# Check if CHANGELOG.md is updated
Write-Warn "Have you updated CHANGELOG.md for this release?"
$response = Read-Host "Continue? (y/N)"
if ($response -ne 'y' -and $response -ne 'Y') {
    Write-Info "Please update CHANGELOG.md and try again."
    exit 1
}

# Bump version
Write-Info "Bumping $VersionType version..."
npm version $VersionType

$newVersion = (Get-Content package.json | ConvertFrom-Json).version
Write-Info "New version: $newVersion"

# Push to GitHub
Write-Info "Pushing to GitHub..."
git push
if ($LASTEXITCODE -eq 0) {
    git push --tags
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Info "✓ Release process started!"
    Write-Info "✓ Version bumped: $currentVersion → $newVersion"
    Write-Info "✓ Tag created: v$newVersion"
    Write-Info "✓ Pushed to GitHub"
    Write-Host ""
    Write-Info "GitHub Actions will now:"
    Write-Info "  1. Run all tests"
    Write-Info "  2. Package the extension"
    Write-Info "  3. Publish to VS Code Marketplace"
    Write-Info "  4. Create a GitHub Release"
    Write-Host ""
    Write-Info "Monitor progress at:"
    Write-Info "  https://github.com/ApprenticeDave/VSCodeDiscuss/actions"
    Write-Host ""
    Write-Info "Marketplace (after ~5-10 minutes):"
    Write-Info "  https://marketplace.visualstudio.com/items?itemName=ApprenticeDave.vscode-discuss"
} else {
    Write-Err "Push failed! Check your git configuration."
    exit 1
}
