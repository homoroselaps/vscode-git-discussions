"use strict";
/**
 * DiscussionWebviewProvider - Shows discussion details and chat in a webview panel
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class DiscussionWebviewProvider {
    _extensionUri;
    yamlStorage;
    gitService;
    anchorIndexer;
    treeDataProvider;
    static viewType = 'longLivedDiscussionsChat';
    _view;
    _currentDiscussion;
    constructor(_extensionUri, yamlStorage, gitService, anchorIndexer, treeDataProvider) {
        this._extensionUri = _extensionUri;
        this.yamlStorage = yamlStorage;
        this.gitService = gitService;
        this.anchorIndexer = anchorIndexer;
        this.treeDataProvider = treeDataProvider;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addComment':
                    await this._addComment(data.text);
                    break;
                case 'goToAnchor':
                    await this._goToAnchor();
                    break;
                case 'closeDiscussion':
                    await this._closeDiscussion();
                    break;
            }
        });
        // Show empty state initially
        this._updateWebview();
    }
    /**
     * Show a discussion in the chat panel
     */
    async showDiscussion(discussion) {
        this._currentDiscussion = discussion;
        await this._updateWebview();
    }
    /**
     * Clear the current discussion
     */
    clear() {
        this._currentDiscussion = undefined;
        this._updateWebview();
    }
    /**
     * Refresh the current discussion from disk
     */
    async refresh() {
        if (this._currentDiscussion) {
            const updated = await this.yamlStorage.readDiscussion(this._currentDiscussion.id);
            if (updated) {
                const anchor = this.anchorIndexer.getAnchor(updated.id);
                this._currentDiscussion = {
                    ...updated,
                    currentAnchor: anchor || null,
                    isAnchored: !!anchor,
                };
            }
        }
        await this._updateWebview();
    }
    async _updateWebview() {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({
            type: 'updateDiscussion',
            discussion: this._currentDiscussion || null,
        });
    }
    async _addComment(text) {
        if (!this._currentDiscussion || !text.trim()) {
            return;
        }
        try {
            const user = await this.gitService.getCurrentUser();
            const currentDiscussion = await this.yamlStorage.readDiscussion(this._currentDiscussion.id);
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }
            // Add comment
            const maxId = currentDiscussion.comments.reduce((max, c) => Math.max(max, c.id), 0);
            currentDiscussion.comments.push({
                id: maxId + 1,
                author: user.name,
                created_at: new Date().toISOString(),
                body: text.trim(),
            });
            // Save and commit
            await this.yamlStorage.writeDiscussion(currentDiscussion);
            await this.gitService.commitDiscussion(currentDiscussion.id, 'Add comment', `comment #${maxId + 1}`);
            // Update local state
            const anchor = this.anchorIndexer.getAnchor(currentDiscussion.id);
            this._currentDiscussion = {
                ...currentDiscussion,
                currentAnchor: anchor || null,
                isAnchored: !!anchor,
            };
            // Refresh views
            await this._updateWebview();
            await this.treeDataProvider.refresh();
            vscode.window.showInformationMessage('Comment added.');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }
    async _goToAnchor() {
        if (!this._currentDiscussion?.currentAnchor) {
            vscode.window.showWarningMessage('Discussion has no anchor in code.');
            return;
        }
        vscode.commands.executeCommand('longLivedDiscussions.goToAnchor', {
            discussion: this._currentDiscussion,
        });
    }
    async _closeDiscussion() {
        if (!this._currentDiscussion) {
            return;
        }
        vscode.commands.executeCommand('longLivedDiscussions.closeDiscussion', {
            discussion: this._currentDiscussion,
        });
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discussion</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        .empty-state .icon {
            font-size: 48px;
            margin-bottom: 10px;
            opacity: 0.5;
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .header {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBarSectionHeader-background);
        }
        .header h2 {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
            word-break: break-word;
        }
        .header .meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .header .status {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
        }
        .header .status.open {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        .header .status.closed {
            background-color: var(--vscode-descriptionForeground);
            color: white;
        }
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .actions button {
            padding: 4px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .actions button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .comments {
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }
        .comment {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .comment:last-child {
            border-bottom: none;
        }
        .comment .comment-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .comment .author {
            font-weight: 600;
            font-size: 12px;
        }
        .comment .time {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .comment .body {
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .no-comments {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .input-area {
            padding: 10px 12px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBarSectionHeader-background);
        }
        .input-area textarea {
            width: 100%;
            min-height: 60px;
            max-height: 120px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            resize: vertical;
        }
        .input-area textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .input-area button {
            margin-top: 8px;
            padding: 6px 14px;
            font-size: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .input-area button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .input-area button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div id="empty-state" class="empty-state">
        <div class="icon">💬</div>
        <p>Select a discussion from the tree above to view comments and add replies.</p>
    </div>
    
    <div id="container" class="container" style="display: none;">
        <div class="header">
            <h2 id="title"></h2>
            <div class="meta">
                <span id="status" class="status"></span>
                <span id="file-info"></span>
            </div>
            <div class="actions">
                <button id="go-to-anchor" title="Go to anchor in code">📍 Go to Code</button>
                <button id="close-discussion" title="Close this discussion">✓ Close</button>
            </div>
        </div>
        
        <div id="comments" class="comments"></div>
        
        <div class="input-area">
            <textarea id="comment-input" placeholder="Write a comment..." rows="3"></textarea>
            <button id="send-btn">Add Comment</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const emptyState = document.getElementById('empty-state');
        const container = document.getElementById('container');
        const titleEl = document.getElementById('title');
        const statusEl = document.getElementById('status');
        const fileInfoEl = document.getElementById('file-info');
        const commentsEl = document.getElementById('comments');
        const commentInput = document.getElementById('comment-input');
        const sendBtn = document.getElementById('send-btn');
        const goToAnchorBtn = document.getElementById('go-to-anchor');
        const closeDiscussionBtn = document.getElementById('close-discussion');

        let currentDiscussion = null;

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateDiscussion':
                    currentDiscussion = message.discussion;
                    render();
                    break;
            }
        });

        function render() {
            if (!currentDiscussion) {
                emptyState.style.display = 'flex';
                container.style.display = 'none';
                return;
            }

            emptyState.style.display = 'none';
            container.style.display = 'flex';

            // Header
            titleEl.textContent = currentDiscussion.title;
            statusEl.textContent = currentDiscussion.status;
            statusEl.className = 'status ' + currentDiscussion.status;
            
            const anchor = currentDiscussion.anchor;
            fileInfoEl.textContent = ' • ' + anchor.file_path + ':' + anchor.start_line;

            // Show/hide buttons based on state
            goToAnchorBtn.style.display = currentDiscussion.isAnchored ? 'inline-block' : 'none';
            closeDiscussionBtn.style.display = currentDiscussion.status === 'closed' ? 'none' : 'inline-block';

            // Comments
            if (currentDiscussion.comments.length === 0) {
                commentsEl.innerHTML = '<div class="no-comments">No comments yet. Start the conversation!</div>';
            } else {
                commentsEl.innerHTML = currentDiscussion.comments.map(comment => {
                    const date = new Date(comment.created_at);
                    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    return \`
                        <div class="comment">
                            <div class="comment-header">
                                <span class="author">\${escapeHtml(comment.author)}</span>
                                <span class="time">\${timeStr}</span>
                            </div>
                            <div class="body">\${escapeHtml(comment.body)}</div>
                        </div>
                    \`;
                }).join('');
                
                // Scroll to bottom
                commentsEl.scrollTop = commentsEl.scrollHeight;
            }

            // Disable input if closed
            commentInput.disabled = currentDiscussion.status === 'closed';
            sendBtn.disabled = currentDiscussion.status === 'closed';
            if (currentDiscussion.status === 'closed') {
                commentInput.placeholder = 'Discussion is closed';
            } else {
                commentInput.placeholder = 'Write a comment...';
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Send comment
        sendBtn.addEventListener('click', () => {
            const text = commentInput.value.trim();
            if (text && currentDiscussion) {
                vscode.postMessage({ type: 'addComment', text: text });
                commentInput.value = '';
            }
        });

        // Ctrl+Enter to send
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                sendBtn.click();
            }
        });

        // Go to anchor
        goToAnchorBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'goToAnchor' });
        });

        // Close discussion
        closeDiscussionBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'closeDiscussion' });
        });
    </script>
</body>
</html>`;
    }
}
exports.DiscussionWebviewProvider = DiscussionWebviewProvider;
//# sourceMappingURL=discussionWebviewProvider.js.map