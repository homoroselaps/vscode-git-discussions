/**
 * DiscussionWebviewProvider - Shows discussion details and chat in a webview panel
 */

import * as vscode from 'vscode';
import { DiscussionWithAnchorStatus, Discussion, hasMentionFor, generateCommentId } from '../models/discussion.js';
import { YamlStorageService } from '../services/yamlStorageService.js';
import { GitService } from '../services/gitService.js';
import { AnchorIndexer } from '../services/anchorIndexer.js';
import { DiscussionsTreeDataProvider } from './discussionsTreeDataProvider.js';
import { ReadMentionsStorage } from '../services/readMentionsStorage.js';

export class DiscussionWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'longLivedDiscussionsChat';

    private _view?: vscode.WebviewView;
    private _currentDiscussion?: DiscussionWithAnchorStatus;
    private _currentUserName: string = '';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly yamlStorage: YamlStorageService,
        private readonly gitService: GitService,
        private readonly anchorIndexer: AnchorIndexer,
        private readonly treeDataProvider: DiscussionsTreeDataProvider,
        private readonly readMentionsStorage: ReadMentionsStorage,
    ) {
        // Load current user name
        this._loadCurrentUser();
        
        // Refresh when read mentions change
        this.readMentionsStorage.onDidChange(() => this._updateWebview());
    }

    private async _loadCurrentUser(): Promise<void> {
        const user = await this.gitService.getCurrentUser();
        this._currentUserName = user.name;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
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
                case 'markCommentMentionRead':
                    await this._markCommentMentionRead(data.commentId);
                    break;
                case 'markAllMentionsRead':
                    await this._markAllMentionsRead();
                    break;
            }
        });

        // Show empty state initially
        this._updateWebview();
    }

    /**
     * Show a discussion in the chat panel
     */
    public async showDiscussion(discussion: DiscussionWithAnchorStatus) {
        this._currentDiscussion = discussion;
        await this._updateWebview();
    }

    /**
     * Clear the current discussion
     */
    public clear() {
        this._currentDiscussion = undefined;
        this._updateWebview();
    }

    /**
     * Refresh the current discussion from disk
     */
    public async refresh() {
        await this._loadCurrentUser();
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

    private async _updateWebview() {
        if (!this._view || !this._currentDiscussion) {
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateDiscussion',
                    discussion: null,
                    currentUserName: this._currentUserName,
                    readCommentIds: [],
                });
            }
            return;
        }

        // Get the list of comment IDs that have been marked as read locally
        const readCommentIds = this.readMentionsStorage.getReadCommentIds();

        this._view.webview.postMessage({
            type: 'updateDiscussion',
            discussion: this._currentDiscussion,
            currentUserName: this._currentUserName,
            readCommentIds: readCommentIds,
        });
    }

    private async _markCommentMentionRead(commentId: string) {
        if (!this._currentDiscussion) {
            return;
        }

        try {
            // Mark as read in local storage (no YAML changes, no commits)
            await this.readMentionsStorage.markCommentRead(commentId);

            // Refresh views (storage fires onDidChange which triggers refresh)
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to mark mention as read: ${error}`);
        }
    }

    private async _markAllMentionsRead() {
        if (!this._currentDiscussion) {
            return;
        }

        try {
            // Get all comment IDs that have mentions for current user
            const commentIdsWithMentions: string[] = [];
            for (const comment of this._currentDiscussion.comments) {
                if (hasMentionFor(comment.body, this._currentUserName)) {
                    commentIdsWithMentions.push(comment.id);
                }
            }

            if (commentIdsWithMentions.length === 0) {
                vscode.window.showInformationMessage('No mentions to mark as read.');
                return;
            }

            // Mark all as read in local storage (no YAML changes, no commits)
            await this.readMentionsStorage.markCommentsRead(commentIdsWithMentions);

            vscode.window.showInformationMessage('All mentions marked as read.');
            // Refresh views (storage fires onDidChange which triggers refresh)
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to mark mentions as read: ${error}`);
        }
    }

    private async _addComment(text: string) {
        if (!this._currentDiscussion || !text.trim()) {
            return;
        }

        try {
            const user = await this.gitService.getCurrentUser();
            const currentDiscussion = await this.yamlStorage.readDiscussion(this._currentDiscussion.id);
            
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }

            // Add comment with unique ID
            const commentId = generateCommentId();
            currentDiscussion.comments.push({
                id: commentId,
                author: user.name,
                created_at: new Date().toISOString(),
                body: text.trim(),
            });

            // Save and commit
            await this.yamlStorage.writeDiscussion(currentDiscussion);
            await this.gitService.commitDiscussion(
                currentDiscussion.id,
                'Add comment',
                commentId
            );

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
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }

    private async _goToAnchor() {
        if (!this._currentDiscussion?.currentAnchor) {
            vscode.window.showWarningMessage('Discussion has no anchor in code.');
            return;
        }

        vscode.commands.executeCommand('longLivedDiscussions.goToAnchor', {
            discussion: this._currentDiscussion,
        });
    }

    private async _closeDiscussion() {
        if (!this._currentDiscussion) {
            return;
        }

        vscode.commands.executeCommand('longLivedDiscussions.closeDiscussion', {
            discussion: this._currentDiscussion,
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
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
        .comment.has-mention {
            background-color: rgba(255, 193, 7, 0.1);
            border-left: 3px solid var(--vscode-notificationsWarningIcon-foreground, #cca700);
        }
        .mention-bell {
            cursor: pointer;
            margin-left: 6px;
            opacity: 0.9;
            font-size: 12px;
        }
        .mention-bell:hover {
            opacity: 1;
        }
        .mention {
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }
        .mark-all-btn {
            margin-left: auto;
            padding: 2px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .mark-all-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
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
        let currentUserName = '';
        let readCommentIds = [];

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateDiscussion':
                    currentDiscussion = message.discussion;
                    currentUserName = message.currentUserName || '';
                    readCommentIds = message.readCommentIds || [];
                    render();
                    break;
            }
        });

        /**
         * Check if a mention matches an author name using fuzzy matching.
         * Characters in mention must appear in order in author name (case-insensitive).
         */
        function matchesMention(mention, authorName) {
            const cleanMention = mention.replace(/^@/, '').toLowerCase();
            const normalizedAuthor = authorName.replace(/\\s+/g, '').toLowerCase();
            
            if (!cleanMention || !normalizedAuthor) return false;
            
            let authorIndex = 0;
            for (const char of cleanMention) {
                const foundIndex = normalizedAuthor.indexOf(char, authorIndex);
                if (foundIndex === -1) return false;
                authorIndex = foundIndex + 1;
            }
            return true;
        }

        /**
         * Check if comment has unread mention for current user
         * A mention is unread if the comment ID is NOT in readCommentIds
         */
        function hasUnreadMentionForUser(comment) {
            if (!currentUserName) return false;
            // If this comment's mentions have been marked as read, skip
            if (readCommentIds.includes(comment.id)) return false;
            
            // Check if comment body has a mention for current user
            const regex = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;
            let match;
            while ((match = regex.exec(comment.body)) !== null) {
                if (matchesMention(match[1], currentUserName)) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Format mentions in comment body with styling
         */
        function formatMentions(text) {
            // First escape HTML
            let escaped = escapeHtml(text);
            
            // Replace @mentions with highlighted style
            escaped = escaped.replace(/@([a-zA-Z][a-zA-Z0-9_-]*)/g, '<span class="mention">@$1</span>');
            
            return escaped;
        }

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

            // Check if any comments have unread mentions for current user
            const hasAnyUnreadMentions = currentDiscussion.comments.some(c => hasUnreadMentionForUser(c));

            // Comments
            if (currentDiscussion.comments.length === 0) {
                commentsEl.innerHTML = '<div class="no-comments">No comments yet. Start the conversation!</div>';
            } else {
                commentsEl.innerHTML = currentDiscussion.comments.map(comment => {
                    const date = new Date(comment.created_at);
                    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const hasMention = hasUnreadMentionForUser(comment);
                    const mentionClass = hasMention ? 'has-mention' : '';
                    const bellIcon = hasMention 
                        ? \`<span class="mention-bell" data-comment-id="\${comment.id}" title="Click to mark mention as read">🔔</span>\`
                        : '';
                    
                    return \`
                        <div class="comment \${mentionClass}">
                            <div class="comment-header">
                                <span class="author">\${escapeHtml(comment.author)}\${bellIcon}</span>
                                <span class="time">\${timeStr}</span>
                            </div>
                            <div class="body">\${formatMentions(comment.body)}</div>
                        </div>
                    \`;
                }).join('');
                
                // Add click handlers for bell icons
                document.querySelectorAll('.mention-bell').forEach(bell => {
                    bell.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const commentId = bell.dataset.commentId;
                        vscode.postMessage({ type: 'markCommentMentionRead', commentId: commentId });
                    });
                });
                
                // Scroll to bottom
                commentsEl.scrollTop = commentsEl.scrollHeight;
            }

            // Disable input if closed
            commentInput.disabled = currentDiscussion.status === 'closed';
            sendBtn.disabled = currentDiscussion.status === 'closed';
            if (currentDiscussion.status === 'closed') {
                commentInput.placeholder = 'Discussion is closed';
            } else {
                commentInput.placeholder = 'Write a comment... (use @name to mention)';
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
