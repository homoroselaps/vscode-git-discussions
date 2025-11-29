# Changelog

All notable changes to the "VSCodeDiscuss" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-11-20

### Added

#### Core Features

- **Location-anchored discussions** - Create discussions tied to specific code lines/ranges
- **Webview sidebar panel** - Dedicated activity bar icon and sidebar view for all discussions
- **Threaded comment trees** - Reply to discussions and individual comments with infinite nesting
- **Comment navigation** - Click any discussion or reply to jump to code location
- **Status management** - Mark discussions as Active or Resolved
- **Git integration** - Auto-commit functionality for versioning discussions
- **Merge conflict detection** - UI for resolving conflicts in discussions.json

#### Data & Storage

- JSON-based storage in `.vscode-discuss/discussions.json`
- Discussion model with UUID, file path, line range, status, timestamps
- Comment model with author, body, timestamps, and parentId for threading
- Author attribution from Git user configuration
- Storage versioning for future migrations (v1.0.0)

#### UI Components

- VS Code commenting API integration for creating discussions
- CommentingRangeProvider for enabling comments on all files
- TreeView provider showing discussions grouped by status
- Webview panel with:
  - Discussion cards showing status, author, comment count, file path
  - Nested comment display with visual indentation
  - Reply buttons on discussions and comments
  - Inline reply input fields (shown on click, hidden on blur)
  - Resolve/Unresolve buttons
  - Delete buttons with confirmation
  - Refresh button

#### Commands

- `VSCode Discuss: Create Discussion` - Create new discussion from selection
- `VSCode Discuss: Show Discussions` - Quick pick navigation
- `VSCode Discuss: Refresh Discussions` - Reload all data
- Context menu commands for resolve/unresolve/delete

#### Git Features

- GitService wrapping VS Code Git extension API
- Repository detection and information retrieval
- Auto-commit on discussion create/update/delete (optional)
- Configurable commit message templates
- Conflict detection: `hasConflicts()`, `getConflictedFiles()`, `isInMergeState()`
- Conflict resolution UI with three options:
  - Open file for manual resolution
  - Use local version
  - Cancel for later

#### Configuration

- `vscodeDiscuss.git.autoCommit` (boolean, default: false)
- `vscodeDiscuss.git.commitMessageTemplate` (string, default: "Update discussions: {{action}}")

#### Testing

- 75 comprehensive tests:
  - 33 model tests (Author, Comment, Discussion, Storage)
  - 14 StorageService integration tests
  - 6 CommentController tests
  - 5 GitUserService tests
  - 9 GitService tests
  - 8 command registration tests

#### Developer Experience

- TypeScript 5.9.3 with strict mode
- ESLint configuration
- Prettier formatting
- Mocha test framework
- VS Code Extension Test Runner
- Memory bank system for project documentation
- Comprehensive inline documentation

### Changed

- Replaced VS Code comment threads with webview sidebar as primary UI
- Comment model now includes `parentId` field for threading
- StorageService.addReply() accepts optional parentId parameter
- Discussions webview uses tree rendering algorithm for nested comments

### Fixed

- Reply submission now correctly finds visible input area
- Reply inputs properly show/hide based on focus
- Event propagation issues with nested click handlers
- Auto-refresh after discussion changes

## [Unreleased]

### Planned Features

- Markdown rendering in comments
- Edit existing comments
- Search and filter discussions
- Export discussions (markdown, PDF)
- @mentions support
- Emoji reactions
- GitHub integration (optional)
