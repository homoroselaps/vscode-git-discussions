Here’s a complete, implementation‑ready user story / spec you can hand to Codex to build the VS Code extension.

⸻

Epic: Long‑Lived Git Discussions Sidecar

Goal
Provide a VS Code extension that links a code repository to a separate “discussions” Git repository, letting developers:
	•	Anchor long‑lived discussions to lines of code via special comment anchors.
	•	View, create, and reply to discussions in a dedicated sidebar.
	•	Automatically store discussions as YAML files in the sidecar repo.
	•	Keep code repo history clean (no discussion commits in the main repo).

⸻

Core Concepts

Repositories
	•	Code Repo (primary)
The Git repo the user opens in VS Code (the workspace folder).
	•	Discussions Repo (sidecar)
A separate Git repo on disk, linked to the code repo via:
	•	Naming convention: <codeRepoName>.discuss as a sibling folder, e.g.:
	•	Code: /dev/my-project/
	•	Discussions: /dev/my-project.discuss/
	•	Or explicit path in VS Code settings:
"longLivedDiscussions.discussionRepoPath": "/some/other/path"

No submodules. They are just two normal repos on disk.

⸻

Discussion Anchors
	•	A discussion anchor is a special comment in source code that contains a discussion ID.
	•	Anchors are language-aware: the extension uses the correct line comment syntax for each language.
	•	Generic anchor pattern inside a single-line comment:

[discussion:<id>]

Examples:
	•	TypeScript / JavaScript:
// [discussion:d-3f9a7c2b]
	•	C# / C++ / Java:
// [discussion:d-3f9a7c2b]
	•	Python:
# [discussion:d-3f9a7c2b]
	•	Shell:
# [discussion:d-3f9a7c2b]
	•	Haskell:
-- [discussion:d-3f9a7c2b]

The extension must be able to:
	•	Detect anchors by regex on line comments.
	•	Insert a correctly formatted anchor given:
	•	Current language.
	•	Generated unique ID.

ID format:
	•	String: d- + 8 lowercase hex chars, e.g. d-3f9a7c2b.
	•	Must be unique within the discussions repo (extension checks existing IDs).

⸻

Discussion YAML Files

Each discussion lives as a YAML file in the discussions repo.

Location (inside discussions repo):
	•	Root folder assumed to be the repo root.
	•	Discussions stored under discussions/<id>.yml, e.g.:

my-project.discuss/
  .git/
  discussions/
    d-3f9a7c2b.yml
    d-8ab4f121.yml

YAML schema (first version)

id: "d-3f9a7c2b"
title: "Clarify negative value handling in Foo"
status: "open" # "open" | "closed"

code_repo: "git@github.com:org/my-project.git" # optional but preferred
discussion_repo: "git@github.com:org/my-project.discuss.git" # optional

anchor:
  commit_sha: "0a1b2c3d4e5f6789abcdefff111222333444555"
  file_path: "src/foo.ts"
  start_line: 42         # 1-based
  end_line: 42           # 1-based, inclusive
  language: "typescript"
  symbol_path: "Foo.handleNegative" # optional, initially null
  anchor_line: 41        # line where [discussion:id] comment is

metadata:
  created_by: "jtm"
  created_at: "2025-11-29T12:34:56Z"

comments:
  - id: 1
    author: "jtm"
    created_at: "2025-11-29T12:34:56Z"
    body: |
      This algorithm looks fishy, what happens with negative values?

  - id: 2
    author: "alice"
    created_at: "2025-11-29T13:01:00Z"
    body: |
      Good catch, I added a guard in 0f9e8d...

Notes:
	•	comments[*].id is a simple incrementing integer within the file.
	•	created_at in ISO 8601 string.
	•	anchor.commit_sha is the current HEAD of the code repo at time of creation.
	•	If anchor is later removed from code, file still exists and status may be closed.

⸻

User Stories & Acceptance Criteria

Story 1: Link code repo to discussions repo

As a developer
I want the extension to automatically detect and link a discussions repo to my code repo
So that discussions are stored in a dedicated Git repo.

Behavior
	1.	When a workspace folder is opened:
	•	Check if it’s a Git repo (presence of .git).
	2.	Determine the discussions repo path using this priority:
	1.	VS Code setting longLivedDiscussions.discussionRepoPath.
	2.	Sibling folder naming convention:
	•	If workspace folder name is my-project, look for ../my-project.discuss.
	3.	If a discussions repo is found:
	•	Verify it’s a Git repo (contains .git).
	•	Store paths internally: codeRepoPath, discussionRepoPath.
	4.	If not found:
	•	Show a non-blocking notification:
	•	“No discussions repository found. Configure longLivedDiscussions.discussionRepoPath or create a sibling repo named <repoName>.discuss.”

Acceptance Criteria
	•	When opening /dev/my-project and /dev/my-project.discuss exists with .git, the extension links them without extra config.
	•	When longLivedDiscussions.discussionRepoPath is set to /custom/path, that location is used even if a sibling folder exists.
	•	If no discussions repo is found, extension still loads but the sidebar shows a message like “No discussions repo connected”.

⸻

Story 2: Sidebar Activity View

As a developer
I want a dedicated sidebar view that lists all discussions anchored in my code
So that I can browse, open, and reply to discussions easily.

Behavior
	•	Extension contributes a new activity bar/icon: “Discussions”.
	•	In that view, show a tree with two top-level groups:
	1.	Files with Discussions
	•	Nested by file path relative to workspace root:
	•	src/
	•	foo.ts
	•	d-3f9a7c2b (line 42): Clarify negative value handling in Foo
	•	d-8ab4f121 (line 120): Document retry logic
	•	bar.ts
	•	d-7aa93be5 (line 10): Rename variable
	•	Within each file, discussions ordered by anchor.start_line.
	2.	Unanchored / Historical
	•	Discussions without a current anchor in code (YAML file exists but no [discussion:id] found in any file).
	•	Example node label:
	•	d-3f9a7c2b: Clarify negative value handling in Foo (anchor missing)
	•	Clicking a discussion node:
	•	If anchor exists:
	•	Opens the file in an editor.
	•	Reveals the relevant line (anchor.start_line).
	•	Optionally adds a decoration or highlight on that line.
	•	If anchor does not exist:
	•	Opens a read-only view or panel showing discussion details.
	•	Option: also open the YAML file in a new editor tab if user clicks a dedicated action.
	•	Clicking a file node:
	•	Opens the file, line 1 (standard VS Code behavior for tree file nodes).

Acceptance Criteria
	•	When workspace contains code files with [discussion:...] anchors, those discussions appear grouped under their file in the tree.
	•	If a YAML file exists for an ID not present anywhere in the code, it appears under the “Unanchored / Historical” group.
	•	Double-clicking a discussion with anchor scrolls to its line in the code file.

⸻

Story 3: Detect and Index Anchors

As a developer
I want the extension to detect anchor comments in my code
So that existing anchors are reflected in the sidebar and mapped to YAML discussions.

Behavior
	•	On activation (and on file save events):
	•	Scan all files in the workspace that match a default set of languages, e.g.:
	•	*.ts, *.tsx, *.js, *.jsx, *.cs, *.java, *.py, etc.
	•	For each line:
	•	Detect single-line comments using language configuration.
	•	Search for the string pattern:
	•	\[discussion:([a-z0-9-]+)\]
	•	Extract <id> and record:
	•	file_path
	•	anchor_line (line number of comment)
	•	For each ID:
	•	Look for discussions/<id>.yml in the discussions repo.
	•	If it exists:
	•	Read YAML, update anchor.file_path and anchor.anchor_line if needed.
	•	If it does not exist:
	•	Treat as an uninitialized discussion anchor (optionally show special icon).

Acceptance Criteria
	•	If a file contains // [discussion:d-3f9a7c2b], the extension recognizes ID d-3f9a7c2b.
	•	If discussions/d-3f9a7c2b.yml exists, the sidebar shows the discussion under that file.
	•	If no YAML exists, the sidebar still shows an entry, maybe labeled “(anchor only, no discussion file yet)”.

⸻

Story 4: Create a New Discussion (Command Palette + Editor)

As a developer
I want a command that inserts a new discussion anchor comment and creates a matching YAML file
So that I can start a discussion from any line in my code.

Command
	•	ID: longLivedDiscussions.createDiscussion
	•	Title: Create Discussion for Selection

Behavior
	1.	User selects a line or range in an open text editor.
	2.	User runs command Create Discussion for Selection (via Command Palette or context menu).
	3.	Extension checks:
	•	That a discussions repo is linked.
	•	That the working tree of the code repo is clean, or at least warns if there are uncommitted changes.
	4.	Extension generates a new unique ID, e.g. d-3f9a7c2b:
	•	Check discussions/<id>.yml does not exist; if it does, regenerate.
	5.	Extension determines the correct line comment prefix for the file’s language:
	•	For TS/JS/Java/C#/C++: // 
	•	For Python/Shell: # 
	•	For unknown languages, default to // .
	6.	Insert an anchor comment above the current selection (or at the current line if no selection):

// [discussion:d-3f9a7c2b]

Or using language-specific comment prefix.

	7.	Extension asks user for a title via showInputBox (optional but recommended).
	8.	Extension creates a new YAML file discussions/d-3f9a7c2b.yml in discussions repo with initial content:

id: "d-3f9a7c2b"
title: "<user input or default 'Discussion d-3f9a7c2b'>"
status: "open"
code_repo: "<derived from git remote or empty>"
anchor:
  commit_sha: "<current HEAD of code repo, via git rev-parse HEAD>"
  file_path: "<relative path to file>"
  start_line: <start of selection or current line (1-based)>
  end_line: <end of selection or current line>
  language: "<VSCode language id>"
  symbol_path: null
  anchor_line: <line where comment was inserted>
metadata:
  created_by: "<current OS username or empty>"
  created_at: "<current ISO timestamp>"
comments:
  - id: 1
    author: "<current OS username or empty>"
    created_at: "<current ISO timestamp>"
    body: |
      <optional initial comment text from user input, or empty>


	9.	Extension saves modified code file.
	10.	Extension runs Git commands in discussions repo:
	•	git add discussions/d-3f9a7c2b.yml
	•	git commit -m "Add discussion d-3f9a7c2b for <file_path>:<line>"
(If commit fails, show error.)
	11.	Sidebar refreshes to include the new discussion.

Acceptance Criteria
	•	Running the command on a TypeScript file inserts a // [discussion:<id>] line with a short ID.
	•	A matching YAML file is created in the discussions repo.
	•	The new discussion appears in the sidebar under the correct file and line.
	•	If no discussions repo is linked, command shows a clear error message.

⸻

Story 5: Add a Comment to an Existing Discussion

As a developer
I want to append a comment to an existing discussion from the sidebar
So that I can continue conversations tied to code.

Command
	•	ID: longLivedDiscussions.addComment
	•	Title: Add Comment to Discussion

Behavior
	1.	User selects a discussion node in the sidebar.
	2.	User triggers Add Comment via:
	•	Context menu on the node, or
	•	Command Palette (with the selected discussion as context).
	3.	Extension prompts user for comment text (multi-line input possible).
	4.	Extension opens and parses the YAML file for that discussion.
	•	Find the max comments[*].id, increment by 1.
	5.	Append new comment:

- id: <next_id>
  author: "<current OS username or empty>"
  created_at: "<current ISO timestamp>"
  body: |
    <user input>


	6.	Write updated YAML back to disk.
	7.	Run Git commands in discussions repo:
	•	git add discussions/<id>.yml
	•	git commit -m "Add comment <next_id> to discussion <id>"
	8.	Refresh sidebar.

Acceptance Criteria
	•	After adding a comment, it appears in the discussion’s detail view (see next story).
	•	YAML file is updated and committed in the discussions repo.
	•	No changes are made in the code repo.

⸻

Story 6: View Discussion Details in Sidebar

As a developer
I want to see all comments of a discussion in the sidebar
So that I can read the history at a glance.

Behavior
	•	Selecting a discussion node displays its details in a panel (e.g. using WebviewView or details pane):
	•	Title
	•	Status (open / closed)
	•	Anchor info (file path, line range, commit)
	•	List of comments in chronological order:
	•	author
	•	created_at
	•	body (formatted as plain text, preserving line breaks)
	•	The panel includes actions:
	•	“Add Comment” → triggers longLivedDiscussions.addComment.
	•	“Open YAML” → opens the YAML file in an editor.
	•	“Close Discussion” (see next story).

Acceptance Criteria
	•	Selecting a discussion node shows its comments and metadata.
	•	Clicking “Open YAML” opens the underlying YAML file.
	•	Comments shown match exactly what’s in the YAML.

⸻

Story 7: Close a Discussion (and optionally remove anchor)

As a developer
I want to mark discussions as closed and optionally remove the anchor from the code
So that resolved topics don’t clutter my code.

Commands
	•	longLivedDiscussions.closeDiscussion — marks discussion as closed.
	•	longLivedDiscussions.closeAndRemoveAnchor — marks closed and removes the [discussion:id] comment.

Behavior: closeDiscussion
	1.	User selects a discussion node.
	2.	Command sets:
	•	status: "closed" in the YAML.
	3.	Git:
	•	git add discussions/<id>.yml
	•	git commit -m "Close discussion <id>"
	4.	Sidebar refresh.

Behavior: closeAndRemoveAnchor
	1.	Perform closeDiscussion steps.
	2.	If anchor.file_path exists and anchor ID line is found in that file:
	•	Open file.
	•	Remove the comment line containing [discussion:<id>] (and only that line).
	•	Save file.
	3.	(Optional first version) Leave code repo commit to the user (do not auto-commit), but:
	•	Show notification: “Anchor removed from code. Please commit your code changes.”
	4.	Sidebar moves this discussion from “Files with Discussions” into “Unanchored / Historical”.

Acceptance Criteria
	•	After closeDiscussion, YAML has status: "closed".
	•	After closeAndRemoveAnchor, the anchor comment is removed from the code file if present.
	•	Discussion appears under the “Unanchored / Historical” group when anchor is removed.

⸻

Story 8: Show Historical / Unanchored Discussions

As a developer
I want to see discussions whose anchors no longer exist in the code
So that I can access old decisions and context.

Behavior
	•	On indexing:
	•	Build a set of all IDs that appear in [discussion:<id>] anchors in code.
	•	For each YAML file in discussions/*.yml, if its id is not in that set:
	•	Add it under “Unanchored / Historical”.
	•	Node label example:
	•	d-3f9a7c2b: Clarify negative value handling in Foo (anchor missing)
	•	Clicking such a node:
	•	Opens details panel with all comments.
	•	Optionally, show last known anchor.file_path and start_line.
	•	Button: “Re-anchor” (future enhancement).

Acceptance Criteria
	•	Discussions without an anchor appear under the “Unanchored / Historical” group.
	•	Removing an anchor from code (without deleting the YAML) causes the discussion to move into that group after refresh or file save.

⸻

Story 9: Configuration

As a developer
I want to configure paths and behavior
So that the extension works for different repository layouts.

Configuration keys (in package.json > contributes.configuration):
	•	longLivedDiscussions.discussionRepoPath (string, optional)
	•	Explicit path to discussions repo root.
	•	longLivedDiscussions.autoCommitDiscussionRepo (boolean, default: true)
	•	If true, auto-run git add + git commit on discussions repo changes.
	•	If false, do only file changes, no Git commands.
	•	longLivedDiscussions.supportedLanguages (array of language IDs)
	•	Default includes typescript, javascript, csharp, java, python, go, etc.
	•	longLivedDiscussions.anchorPattern (string, optional)
	•	Allow customizing the internal pattern, default [discussion:${id}].

Acceptance Criteria
	•	Changing discussionRepoPath is picked up after reload.
	•	If autoCommitDiscussionRepo is false, no Git commands are executed and user must commit manually.

⸻

Extension Contributions Outline (for Codex)

package.json (skeletal)

{
  "name": "long-lived-discussions",
  "displayName": "Long-Lived Git Discussions",
  "activationEvents": [
    "onStartupFinished",
    "onView:longLivedDiscussionsView",
    "onCommand:longLivedDiscussions.createDiscussion",
    "onCommand:longLivedDiscussions.addComment",
    "onCommand:longLivedDiscussions.closeDiscussion",
    "onCommand:longLivedDiscussions.closeAndRemoveAnchor"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "longLivedDiscussions",
          "title": "Discussions",
          "icon": "resources/discussions.svg"
        }
      ]
    },
    "views": {
      "longLivedDiscussions": [
        {
          "id": "longLivedDiscussionsView",
          "name": "Discussions"
        }
      ]
    },
    "commands": [
      {
        "command": "longLivedDiscussions.createDiscussion",
        "title": "Create Discussion for Selection"
      },
      {
        "command": "longLivedDiscussions.addComment",
        "title": "Add Comment to Discussion"
      },
      {
        "command": "longLivedDiscussions.closeDiscussion",
        "title": "Close Discussion"
      },
      {
        "command": "longLivedDiscussions.closeAndRemoveAnchor",
        "title": "Close Discussion and Remove Anchor"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "Long-Lived Discussions",
      "properties": {
        "longLivedDiscussions.discussionRepoPath": {
          "type": "string",
          "description": "Path to the discussions Git repository. If unset, uses sibling '<repoName>.discuss'."
        },
        "longLivedDiscussions.autoCommitDiscussionRepo": {
          "type": "boolean",
          "default": true,
          "description": "Automatically commit changes to the discussions repo."
        },
        "longLivedDiscussions.supportedLanguages": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["typescript", "javascript", "csharp", "java", "python", "go"],
          "description": "Languages where anchors are detected and inserted."
        }
      }
    }
  }
}


⸻

If you want, next step I can turn this into:
	•	A TypeScript skeleton (extension.ts) with the TreeDataProvider, command registrations, and helper functions; or
	•	Example code for anchor detection & YAML read/write that Codex can then expand.