#!/bin/bash
# Helper script for creating releases
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}ℹ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if version type is provided
VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid version type: $VERSION_TYPE"
    echo "Usage: $0 [patch|minor|major]"
    echo ""
    echo "  patch - Bug fixes (0.1.0 → 0.1.1)"
    echo "  minor - New features (0.1.0 → 0.2.0)"
    echo "  major - Breaking changes (0.1.0 → 1.0.0)"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_info "Current version: $CURRENT_VERSION"

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    print_warning "You have uncommitted changes:"
    git status -s
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run tests
print_info "Running tests..."
npm test

if [ $? -ne 0 ]; then
    print_error "Tests failed! Fix errors before releasing."
    exit 1
fi

# Check if CHANGELOG.md is updated
print_warning "Have you updated CHANGELOG.md for this release?"
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Please update CHANGELOG.md and try again."
    exit 1
fi

# Bump version
print_info "Bumping $VERSION_TYPE version..."
npm version $VERSION_TYPE

NEW_VERSION=$(node -p "require('./package.json').version")
print_info "New version: $NEW_VERSION"

# Push to GitHub
print_info "Pushing to GitHub..."
git push && git push --tags

print_info ""
print_info "✓ Release process started!"
print_info "✓ Version bumped: $CURRENT_VERSION → $NEW_VERSION"
print_info "✓ Tag created: v$NEW_VERSION"
print_info "✓ Pushed to GitHub"
print_info ""
print_info "GitHub Actions will now:"
print_info "  1. Run all tests"
print_info "  2. Package the extension"
print_info "  3. Publish to VS Code Marketplace"
print_info "  4. Create a GitHub Release"
print_info ""
print_info "Monitor progress at:"
print_info "  https://github.com/ApprenticeDave/VSCodeDiscuss/actions"
print_info ""
print_info "Marketplace (after ~5-10 minutes):"
print_info "  https://marketplace.visualstudio.com/items?itemName=ApprenticeDave.vscode-discuss"
