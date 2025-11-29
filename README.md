# Long-Lived Git Discussions

> **Anchor long-lived discussions to code and store them in a separate sidecar Git repository**

A VS Code extension that lets developers create persistent, threaded discussions tied to specific lines of code. Unlike inline comments that clutter your codebase, discussions are stored in a separate "sidecar" Git repository, keeping your code history clean.

## ✨ Features

### 📍 **Discussion Anchors**
- Anchor discussions to specific lines with special comment markers: `// [discussion:d-3f9a7c2b]`
- Language-aware comment syntax (supports `//`, `#`, `--`, etc.)
- Navigate instantly from sidebar to code location

### 🗂️ **Sidecar Repository Storage**
- Discussions stored as individual YAML files in a separate Git repo
- No commits in your main code repository
- Easy to version, review, and collaborate on discussions

### 🌳 **Organized Sidebar View**
- Dedicated "Discussions" activity bar icon
- Tree view organized by file → discussions
- "Unanchored / Historical" group for orphaned discussions
- Click to navigate to code or view discussion details

### 💬 **Full Discussion Workflow**
- Create discussions from any line of code
- Add comments to existing discussions
- Close discussions and optionally remove anchors
- Auto-commit discussion changes to sidecar repo

## 🚀 Quick Start

### Setup

1. **Install the extension** from VS Code Marketplace (or from VSIX)
2. **Create a sidecar repo** as a sibling folder:
   ```
   /dev/my-project/          ← Your code repo
   /dev/my-project.discuss/  ← Discussions repo (create this)
   ```
3. **Initialize the discussions repo:**
   ```bash
   cd /dev
   mkdir my-project.discuss
   cd my-project.discuss
   git init
   mkdir discussions
   ```
4. **Open your code repo** in VS Code - the extension auto-detects the sidecar

### Creating a Discussion

1. Select a line or range of code
2. Right-click → **"Create Discussion for Selection"** (or use Command Palette)
3. Enter a title and optional initial comment
4. An anchor comment is inserted, and YAML file created in sidecar repo

### Adding Comments

1. Open the **Discussions** sidebar
2. Right-click a discussion → **"Add Comment to Discussion"**
3. Enter your comment - it's saved and committed automatically

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `longLivedDiscussions.discussionRepoPath` | `""` | Explicit path to discussions repo. If empty, uses sibling `<repoName>.discuss` |
| `longLivedDiscussions.autoCommitDiscussionRepo` | `true` | Auto-commit changes to discussions repo |
| `longLivedDiscussions.autoPush` | `true` | Auto-push to remote after each commit |
| `longLivedDiscussions.autoFetch` | `true` | Auto-fetch/pull changes from remote |
| `longLivedDiscussions.syncIntervalMinutes` | `5` | How often to sync with remote (0 = disabled) |
| `longLivedDiscussions.supportedLanguages` | `[ts, js, py, ...]` | Languages where anchors are detected |

## 🔄 Remote Sync & Collaboration

The extension supports syncing discussions with a remote Git repository for team collaboration.

### Setting Up a Remote

1. **Create a remote repository** on GitHub, GitLab, or your Git server:
   ```
   my-project.discuss  ← Name it to match your sidecar folder
   ```

2. **Add the remote to your local discussions repo:**
   ```bash
   cd /dev/my-project.discuss
   git remote add origin git@github.com:your-org/my-project.discuss.git
   ```

3. **Push your existing discussions:**
   ```bash
   git push -u origin main
   ```

4. **That's it!** The extension will now auto-push after each commit and periodically pull new discussions from teammates.

### Configuring Sync Interval

By default, the extension checks for new discussions every **5 minutes**. To change this:

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for `longLivedDiscussions.syncIntervalMinutes`
3. Set your preferred interval:
   - `5` = Check every 5 minutes (default)
   - `1` = Check every minute (more responsive, more network traffic)
   - `15` = Check every 15 minutes (less frequent)
   - `0` = **Disable** automatic sync (manual only)

**Example settings.json:**
```json
{
  "longLivedDiscussions.syncIntervalMinutes": 10,
  "longLivedDiscussions.autoPush": true,
  "longLivedDiscussions.autoFetch": true
}
```

### Manual Sync

Click the **sync icon** (🔄) in the Discussions panel toolbar to manually pull and push changes at any time.

### Disabling Auto-Sync

If you prefer manual control:
```json
{
  "longLivedDiscussions.autoPush": false,
  "longLivedDiscussions.autoFetch": false,
  "longLivedDiscussions.syncIntervalMinutes": 0
}
```

With these settings, you'll need to manually run `git push` and `git pull` in the discussions repo, or use the sync button.

## 📁 Data Storage

### Discussion YAML Schema

Each discussion is stored as `discussions/<id>.yml`:

```yaml
id: "d-3f9a7c2b"
title: "Clarify error handling logic"
status: "open"  # or "closed"

anchor:
  commit_sha: "abc123..."
  file_path: "src/foo.ts"
  start_line: 42
  end_line: 42
  language: "typescript"
  anchor_line: 41

metadata:
  created_by: "jtm"
  created_at: "2025-11-29T12:34:56Z"

comments:
  - id: 1
    author: "jtm"
    created_at: "2025-11-29T12:34:56Z"
    body: |
      This algorithm needs review for negative values.

  - id: 2
    author: "alice"
    created_at: "2025-11-29T13:00:00Z"
    body: |
      Good catch! Added a guard clause.
```

### Anchor Format

Anchors are language-aware comments containing a discussion ID:

| Language | Anchor Format |
|----------|---------------|
| TypeScript/JavaScript | `// [discussion:d-3f9a7c2b]` |
| Python/Shell | `# [discussion:d-3f9a7c2b]` |
| Haskell/Lua | `-- [discussion:d-3f9a7c2b]` |
| HTML/XML | `<!-- [discussion:d-3f9a7c2b] -->` |

## 🎯 Use Cases

- **Code Reviews**: Leave persistent comments that survive rebases
- **Architecture Decisions**: Document "why" alongside "what"
- **Onboarding**: Leave explanatory notes for newcomers
- **Async Collaboration**: Discuss code across timezones
- **Knowledge Preservation**: Keep decisions even after code changes

## 🔧 Development

### Project Structure

```
src/
├── extension.ts              # Extension entry point
├── models/
│   └── discussion.ts         # Data models & utilities
├── services/
│   ├── sidecarRepoService.ts # Sidecar repo detection
│   ├── gitService.ts         # Git operations
│   ├── yamlStorageService.ts # YAML file I/O
│   └── anchorIndexer.ts      # Anchor scanning
├── providers/
│   └── discussionsTreeDataProvider.ts # Sidebar tree view
└── commands/
    └── commandHandlers.ts    # Command implementations
```

### Building

```bash
npm install
npm run compile
npm run watch  # For development
```

### Testing

Press `F5` to launch the Extension Development Host.

## 📄 License

MIT License

## 🙏 Acknowledgments

- Inspired by [VSCodeDiscuss](https://github.com/ApprenticeDave/VSCodeDiscuss) by David Russell
- Built with the [VS Code Extension API](https://code.visualstudio.com/api)
