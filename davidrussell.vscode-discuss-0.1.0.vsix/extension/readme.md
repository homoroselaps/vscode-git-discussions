<!-- @format -->

# VSCodeDiscuss

> **Code discussions that live with your code**

A Visual Studio Code extension for creating persistent, threaded discussions anchored to specific code locations. Perfect for code reviews, architectural decisions, documentation questions, and asynchronous collaboration.

## ✨ Features

### 📍 **Location-Anchored Discussions**

- Select any code and start a discussion thread
- Discussions stay anchored to specific lines/ranges
- Navigate instantly from discussion to code location

### 🌳 **Threaded Comments**

- Reply to discussions and individual comments
- Infinite nesting depth for complex conversations
- Visual tree structure with indentation and connecting lines
- Each comment shows author and timestamp

### 🎨 **Beautiful Sidebar Panel**

- Dedicated discussions view in the activity bar
- See all discussions at a glance
- Active/Resolved status badges
- Comment counts and file paths
- Click any discussion to jump to code

## 🚀 Quick Start

See [Deployment Guide](https://github.com/ApprenticeDave/VSCodeDiscuss/blob/HEAD/.github/DEPLOYMENT.md) for automated publishing to VS Code Marketplace.

### 💾 **Git-Versioned Storage**

- Discussions stored as JSON in `.vscode-discuss/` folder
- Version controlled alongside your code
- Optional auto-commit on changes
- Merge conflict detection and resolution UI
- Works offline by default

### ⚡ **Fast & Lightweight**

- No external dependencies
- All data stored locally
- Instant search and navigation
- Auto-refresh on changes

## 🚀 Quick Start

### Installation

**From VSIX (Manual Install):**

1. Download the `.vsix` file from releases
2. Open VS Code
3. Run `Extensions: Install from VSIX...` command
4. Select the downloaded file

**From Source (Development):**

```bash
git clone https://github.com/ApprenticeDave/VSCodeDiscuss.git
cd VSCodeDiscuss
npm install
npm run compile
# Press F5 to launch extension development host
```

### First Discussion

1. **Open the sidebar**: Click the 💬 icon in the activity bar
2. **Select some code**: Highlight the lines you want to discuss
3. **Create discussion**:
   - Right-click → "Add Comment" OR
   - Command Palette → "VSCode Discuss: Create Discussion"
4. **Type your comment** and press Enter
5. **View in sidebar**: Your discussion appears in the panel

### Reply to Discussions

1. **From the sidebar panel**:
   - Click "↩ Reply" on any discussion or comment
   - Type your reply in the input field
   - Press "Reply" button to submit

2. **Threaded replies**:
   - Reply to the main discussion (top-level)
   - Reply to specific comments (nested)
   - Build conversation trees

### Navigate to Code

- Click any discussion card to jump to the code location
- Click replies to navigate to the same location
- Code selection is highlighted automatically

## 📖 Usage Guide

### Managing Discussions

**Resolve a Discussion:**

- Click "Resolve" button on a discussion
- Resolved discussions appear with ✓ badge
- Still visible but marked as complete
- Can be unresolve if needed

**Delete a Discussion:**

- Click "Delete" button
- Confirmation dialog appears
- Permanently removes the discussion

**Refresh View:**

- Click refresh icon in panel header
- Auto-refreshes after any change
- Syncs with file system changes

### Git Integration

**Enable Auto-Commit:**

```json
{
  "vscodeDiscuss.git.autoCommit": true,
  "vscodeDiscuss.git.commitMessageTemplate": "Update discussions: {{action}}"
}
```

**Merge Conflict Handling:**
When conflicts occur in `discussions.json`:

1. Extension detects the conflict automatically
2. Three options presented:
   - **Open File**: Resolve manually
   - **Use Local Version**: Keep your changes
   - **Cancel**: Defer resolution

**Best Practices:**

- Pull before creating/editing discussions
- Enable auto-commit for automatic versioning
- Review conflicts before pushing

### Comment Tree Structure

Discussions use a tree structure:

```
Discussion (root comment)
├── Reply 1
│   ├── Reply to Reply 1
│   └── Another reply
├── Reply 2
└── Reply 3
    └── Nested reply
        └── Deeply nested
```

- Visual indentation shows hierarchy
- Left border connects related comments
- Reply to any level in the tree
- Infinite nesting supported

## ⚙️ Configuration

| Setting                                   | Default                            | Description                                                                              |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `vscodeDiscuss.git.autoCommit`            | `false`                            | Automatically commit discussion changes to Git                                           |
| `vscodeDiscuss.git.commitMessageTemplate` | `"Update discussions: {{action}}"` | Template for auto-commit messages. `{{action}}` is replaced with created/updated/deleted |

### Example Settings

```json
{
  // Enable Git auto-commit
  "vscodeDiscuss.git.autoCommit": true,

  // Custom commit message
  "vscodeDiscuss.git.commitMessageTemplate": "docs: {{action}} discussion"
}
```

## 🗂️ Data Storage

Discussions are stored in `.vscode-discuss/discussions.json`:

```json
{
  "version": "1.0.0",
  "discussions": [
    {
      "id": "uuid-here",
      "filePath": "src/app.ts",
      "range": {
        "start": { "line": 10, "character": 0 },
        "end": { "line": 15, "character": 30 }
      },
      "status": "active",
      "createdAt": "2025-11-20T10:00:00Z",
      "updatedAt": "2025-11-20T10:30:00Z",
      "author": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "comments": [
        {
          "id": "comment-uuid",
          "body": "Should we refactor this?",
          "author": { "name": "John Doe", "email": "john@example.com" },
          "createdAt": "2025-11-20T10:00:00Z",
          "updatedAt": "2025-11-20T10:00:00Z"
        },
        {
          "id": "comment-uuid-2",
          "body": "Yes, I think so.",
          "author": { "name": "Jane Smith", "email": "jane@example.com" },
          "parentId": "comment-uuid",
          "createdAt": "2025-11-20T10:30:00Z",
          "updatedAt": "2025-11-20T10:30:00Z"
        }
      ]
    }
  ]
}
```

**Key Points:**

- Human-readable JSON format
- File paths are relative to workspace root
- Line numbers are zero-indexed
- `parentId` creates comment threading
- Version field for future migrations

## 🎯 Use Cases

### Code Review Discussions

- "Why did we choose this approach?"
- "This could be optimized..."
- "Security concern here"

### Documentation & Onboarding

- "What does this function do?"
- "How do I use this API?"
- "Where is this used?"

### Architecture Decisions

- "Should we refactor this module?"
- "Alternative design approaches?"
- "Technical debt to address"

### Async Team Collaboration

- Leave questions for teammates in different timezones
- Document decisions without meetings
- Build institutional knowledge

## 🔧 Development

### Project Structure

```
VSCodeDiscuss/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── controllers/           # VS Code comment controllers
│   ├── models/                # Data models & types
│   ├── services/              # Business logic
│   ├── providers/             # VS Code providers
│   ├── views/                 # Webview panel
│   └── utils/                 # Helper functions
├── .vscode-discuss/           # Sample discussions
├── package.json               # Extension manifest
└── README.md                  # This file
```

### Building

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode for development
npm run test         # Run tests (75 passing)
npm run lint         # ESLint
npm run format       # Prettier
```

### Testing

```bash
npm test
# ✓ 75 tests passing
# - 33 model tests
# - 14 storage tests
# - 6 controller tests
# - 5 git user tests
# - 9 git service tests
# - 8 command tests
```

## 📝 Roadmap

- [x] Phase 1: Foundation & data models
- [x] Phase 2: VS Code commenting API
- [x] Phase 3: Git integration
- [x] Webview sidebar panel
- [x] Threaded comment trees
- [ ] Markdown rendering in comments
- [ ] Edit existing comments
- [ ] Search & filter discussions
- [ ] Export discussions (markdown, PDF)
- [ ] GitHub integration (optional)
- [ ] @mentions support
- [ ] Emoji reactions

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `npm test` and `npm run lint`
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Inspired by GitHub Discussions and code review tools
- Memory bank system from [awesome-copilot](https://github.com/github/awesome-copilot)

---

**Questions?** Open an issue on GitHub  
**Ideas?** Start a discussion in our repository
