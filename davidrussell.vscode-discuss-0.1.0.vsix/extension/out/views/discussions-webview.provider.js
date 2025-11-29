"use strict";
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
exports.DiscussionsWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const models_1 = require("../models");
const utils_1 = require("../utils");
/**
 * Provides the webview for displaying discussions in the sidebar
 */
class DiscussionsWebviewProvider {
    extensionUri;
    storageService;
    static viewType = 'vscodeDiscuss.discussionsView';
    view;
    logger = (0, utils_1.getLogger)();
    _onDidChangeDiscussions = new vscode.EventEmitter();
    onDidChangeDiscussions = this._onDidChangeDiscussions.event;
    constructor(extensionUri, storageService) {
        this.extensionUri = extensionUri;
        this.storageService = storageService;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            const message = data;
            switch (message.type) {
                case 'createDiscussion':
                    if (message.filePath && message.range && message.body) {
                        await this.createDiscussion(message.filePath, message.range, message.body);
                    }
                    break;
                case 'openDiscussion':
                    if (message.discussionId) {
                        await this.openDiscussion(message.discussionId);
                    }
                    break;
                case 'deleteDiscussion':
                    if (message.discussionId) {
                        await this.deleteDiscussion(message.discussionId);
                    }
                    break;
                case 'resolveDiscussion':
                    if (message.discussionId) {
                        await this.toggleResolveDiscussion(message.discussionId);
                    }
                    break;
                case 'addReply':
                    if (message.discussionId && message.replyBody) {
                        await this.addReply(message.discussionId, message.replyBody, message.parentId);
                    }
                    break;
                case 'refresh':
                    await this.refresh();
                    break;
            }
        });
        // Initial load
        void this.refresh();
    }
    async refresh() {
        if (!this.view) {
            return;
        }
        const discussions = await this.storageService.getDiscussions();
        this.logger.debug('Refreshing webview with discussions', { count: discussions.length });
        await this.view.webview.postMessage({
            type: 'update',
            discussions: discussions,
        });
    }
    /**
     * Update the editor context shown in the persistent input area
     */
    async updateEditorContext(editor) {
        if (!this.view) {
            return;
        }
        if (!editor) {
            // No editor open - clear context and discussions (batch messages to avoid delay)
            void this.view.webview.postMessage({
                type: 'updateContext',
                context: null,
            });
            void this.view.webview.postMessage({
                type: 'update',
                discussions: [],
            });
            return;
        }
        const selection = editor.selection;
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        let contextType;
        let range;
        let displayText;
        if (!selection.isEmpty) {
            // Text is selected
            contextType = 'selection';
            range = {
                start: { line: selection.start.line, character: selection.start.character },
                end: { line: selection.end.line, character: selection.end.character },
            };
            const selectedText = editor.document.getText(selection);
            const preview = selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText;
            displayText = `Selected text (${selection.end.line - selection.start.line + 1} lines): "${preview}"`;
        }
        else {
            // Cursor is positioned but no selection
            const line = selection.active.line;
            const lineText = editor.document.lineAt(line).text;
            if (lineText.trim() === '') {
                // Empty line or cursor at start of document - treat as document-level
                contextType = 'document';
                range = {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                };
                displayText = `Entire document`;
            }
            else {
                // Cursor on a line with content
                contextType = 'line';
                range = {
                    start: { line, character: 0 },
                    end: { line, character: lineText.length },
                };
                const preview = lineText.trim().length > 50 ? lineText.trim().substring(0, 50) + '...' : lineText.trim();
                displayText = `Line ${line + 1}: "${preview}"`;
            }
        }
        // Get discussions first to batch all updates together (reduces delay)
        const allDiscussions = await this.storageService.getDiscussions();
        const fileDiscussions = allDiscussions.filter((d) => d.filePath === filePath);
        // Batch context and discussion updates (fire and forget for responsiveness)
        void this.view.webview.postMessage({
            type: 'updateContext',
            context: {
                filePath,
                range,
                contextType,
                displayText,
            },
        });
        void this.view.webview.postMessage({
            type: 'update',
            discussions: fileDiscussions,
        });
        // Check if cursor/selection intersects with any discussion
        const cursorLine = selection.active.line;
        const highlightedDiscussion = fileDiscussions.find((d) => {
            // Check if cursor line is within discussion range
            return cursorLine >= d.range.start.line && cursorLine <= d.range.end.line;
        });
        if (highlightedDiscussion) {
            // Send message to highlight this discussion in the webview (non-blocking)
            void this.view.webview.postMessage({
                type: 'highlightDiscussion',
                discussionId: highlightedDiscussion.id,
            });
        }
    }
    async createDiscussion(filePath, range, body) {
        try {
            // Get git user info for author
            const gitConfig = vscode.workspace.getConfiguration('git');
            const userName = gitConfig.get('defaultUserName') || 'Unknown User';
            const userEmail = gitConfig.get('defaultUserEmail') || 'unknown@example.com';
            // Import the required functions
            const { createDiscussion, createComment } = await Promise.resolve().then(() => __importStar(require('../models')));
            const { v4: uuidv4 } = await Promise.resolve().then(() => __importStar(require('uuid')));
            const discussionId = uuidv4();
            const author = { name: userName, email: userEmail };
            const initialComment = createComment(uuidv4(), body, author);
            const discussion = createDiscussion(discussionId, filePath, range, initialComment, author);
            await this.storageService.createDiscussion(discussion);
            void vscode.window.showInformationMessage('Discussion created');
            void this.refresh();
            this._onDidChangeDiscussions.fire();
        }
        catch (error) {
            this.logger.error('Failed to create discussion', error);
            void vscode.window.showErrorMessage(`Failed to create discussion: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async openDiscussion(discussionId) {
        const discussion = await this.storageService.getDiscussionById(discussionId);
        if (!discussion) {
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, discussion.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const range = new vscode.Range(discussion.range.start.line, discussion.range.start.character, discussion.range.end.line, discussion.range.end.character);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
    async deleteDiscussion(discussionId) {
        const answer = await vscode.window.showWarningMessage('Delete this discussion?', { modal: true }, 'Delete');
        if (answer !== 'Delete') {
            return;
        }
        await this.storageService.deleteDiscussion(discussionId);
        void vscode.window.showInformationMessage('Discussion deleted');
        void this.refresh();
    }
    async toggleResolveDiscussion(discussionId) {
        const discussion = await this.storageService.getDiscussionById(discussionId);
        if (!discussion) {
            return;
        }
        const newStatus = discussion.status === models_1.DiscussionStatus.Active
            ? models_1.DiscussionStatus.Resolved
            : models_1.DiscussionStatus.Active;
        await this.storageService.updateDiscussion(discussionId, {
            status: newStatus,
            updatedAt: new Date().toISOString(),
        });
        void this.refresh();
        this._onDidChangeDiscussions.fire();
    }
    async addReply(discussionId, replyBody, parentId) {
        if (!replyBody || replyBody.trim() === '') {
            void vscode.window.showErrorMessage('Reply cannot be empty');
            return;
        }
        try {
            // Get git user info for author
            const gitConfig = vscode.workspace.getConfiguration('git');
            const userName = gitConfig.get('defaultUserName') || 'Unknown User';
            const userEmail = gitConfig.get('defaultUserEmail') || 'unknown@example.com';
            await this.storageService.addReply(discussionId, replyBody.trim(), {
                name: userName,
                email: userEmail,
            }, parentId);
            void vscode.window.showInformationMessage('Reply added');
            void this.refresh();
            this._onDidChangeDiscussions.fire();
        }
        catch (error) {
            this.logger.error('Failed to add reply', error);
            void vscode.window.showErrorMessage(`Failed to add reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getHtmlForWebview(_webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discussions</title>
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
            padding: 10px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .header h2 {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .refresh-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 16px;
        }
        
        .refresh-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .discussion-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .discussion-wrapper {
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        
        .discussion-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .discussion-card:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        .discussion-card.resolved {
            opacity: 0.6;
        }
        
        .discussion-card.highlighted {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-activeSelectionBackground);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
            animation: highlight-pulse 0.5s ease-in-out;
        }
        
        @keyframes highlight-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
        }
        
        .discussion-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        
        .discussion-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        
        .status-active {
            background-color: var(--vscode-statusBarItem-warningBackground);
            color: var(--vscode-statusBarItem-warningForeground);
        }
        
        .status-resolved {
            background-color: var(--vscode-statusBarItem-prominentBackground);
            color: var(--vscode-statusBarItem-prominentForeground);
        }
        
        .discussion-content {
            margin: 8px 0;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .discussion-text {
            color: var(--vscode-foreground);
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 8px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        .comment-replies {
            margin-left: 20px;
            margin-top: 4px;
            padding-left: 12px;
            border-left: 2px solid var(--vscode-panel-border);
        }
        
        .comment-item {
            margin-bottom: 6px;
        }
        
        .comment-body {
            padding: 8px 10px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 12px;
        }
        
        .comment-body:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .comment-body.selected {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        
        .comment-nested {
            margin-left: 20px;
            margin-top: 6px;
            padding-left: 12px;
            border-left: 2px solid var(--vscode-panel-border);
        }
        
        .reply-author {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 4px;
            font-size: 11px;
        }
        
        .reply-text {
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .reply-input-area {
            margin-top: 8px;
            display: none;
        }
        
        .reply-input-area.visible {
            display: block;
        }
        
        .reply-form {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .reply-input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            resize: vertical;
            min-height: 60px;
        }
        
        .reply-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .reply-submit {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
        }
        
        .reply-submit:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .reply-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .comment-reply-btn {
            background: transparent;
            border: none;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            padding: 4px 8px;
            font-size: 11px;
            margin-top: 4px;
        }
        
        .comment-reply-btn:hover {
            text-decoration: underline;
        }
        
        .discussion-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
        }
        
        .meta-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .discussion-file {
            color: var(--vscode-textLink-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
        }
        
        .discussion-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .action-btn {
            background: transparent;
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-foreground);
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        
        .action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .action-btn.resolve {
            border-color: var(--vscode-statusBarItem-prominentBackground);
        }
        
        .action-btn.delete {
            border-color: var(--vscode-errorForeground);
            color: var(--vscode-errorForeground);
        }
        
        .action-btn.delete:hover {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-errorForeground);
            opacity: 0.1;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }
        
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        
        .comment-count {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        
        /* Persistent Input Area Styles */
        .persistent-input-area {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
        }
        
        .persistent-input-area.disabled {
            opacity: 0.5;
            pointer-events: none;
        }
        
        .input-context {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            padding: 6px 8px;
            background-color: var(--vscode-sideBar-background);
            border-radius: 4px;
        }
        
        .context-icon {
            font-size: 14px;
        }
        
        .context-details {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .context-file {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        
        .context-type {
            font-size: 10px;
            opacity: 0.8;
        }
        
        .persistent-input {
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: vertical;
            min-height: 60px;
            margin-bottom: 8px;
        }
        
        .persistent-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .persistent-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        
        .persistent-input-actions {
            display: flex;
            justify-content: flex-end;
        }
        
        .persistent-input-actions .action-btn.submit {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 16px;
        }
        
        .persistent-input-actions .action-btn.submit:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .persistent-input-actions .action-btn.submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>💬 Discussions</h2>
        <button class="refresh-btn" onclick="refresh()" title="Refresh">
            ↻
        </button>
    </div>
    
    <!-- Persistent Input Area -->
    <div id="persistent-input-area" class="persistent-input-area disabled">
        <div id="input-context" class="input-context">
            <span class="context-icon">📄</span>
            <div class="context-details">
                <div class="context-file" id="context-file">No file open</div>
                <div class="context-type" id="context-type">Open a file to start a discussion</div>
            </div>
        </div>
        <textarea 
            id="persistent-input" 
            class="persistent-input" 
            placeholder="Write your discussion comment here..."
            rows="3"
        ></textarea>
        <div class="persistent-input-actions">
            <button class="action-btn submit" onclick="submitDiscussion()" id="submit-btn" disabled>
                Add Discussion
            </button>
        </div>
    </div>
    
    <div id="discussions-container" class="discussion-list">
        <div class="empty-state">
            <div class="empty-state-icon">💭</div>
            <p>No discussions yet</p>
            <p style="font-size: 11px; margin-top: 8px;">
                Open a file and add a comment to start
            </p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentContext = null;
        
        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        function updateContext(context) {
            currentContext = context;
            const inputArea = document.getElementById('persistent-input-area');
            const contextFile = document.getElementById('context-file');
            const contextType = document.getElementById('context-type');
            const contextIcon = document.querySelector('.context-icon');
            const input = document.getElementById('persistent-input');
            const submitBtn = document.getElementById('submit-btn');
            
            if (!context) {
                // No editor open
                inputArea.classList.add('disabled');
                contextFile.textContent = 'No file open';
                contextType.textContent = 'Open a file to start a discussion';
                contextIcon.textContent = '📄';
                input.disabled = true;
                submitBtn.disabled = true;
                return;
            }
            
            // Editor is open
            inputArea.classList.remove('disabled');
            contextFile.textContent = context.filePath;
            contextType.textContent = context.displayText;
            input.disabled = false;
            
            // Update icon and placeholder based on context type
            if (context.contextType === 'document') {
                contextIcon.textContent = '📄';
                input.placeholder = 'Add a comment about this entire document...';
            } else if (context.contextType === 'selection') {
                contextIcon.textContent = '✂️';
                input.placeholder = 'Add a comment about the selected text...';
            } else if (context.contextType === 'line') {
                contextIcon.textContent = '➡️';
                input.placeholder = 'Add a comment about this line...';
            }
            
            // Enable submit button if there's text
            const hasText = input.value.trim().length > 0;
            submitBtn.disabled = !hasText;
        }
        
        // Enable/disable submit button as user types
        document.addEventListener('DOMContentLoaded', () => {
            const input = document.getElementById('persistent-input');
            const submitBtn = document.getElementById('submit-btn');
            
            input.addEventListener('input', (e) => {
                const hasText = e.target.value.trim().length > 0;
                submitBtn.disabled = !hasText || !currentContext;
            });
            
            // Handle Enter key to submit (Ctrl/Cmd+Enter)
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitDiscussion();
                }
            });
        });
        
        function submitDiscussion() {
            const input = document.getElementById('persistent-input');
            const body = input.value.trim();
            
            if (!body || !currentContext) {
                return;
            }
            
            vscode.postMessage({
                type: 'createDiscussion',
                filePath: currentContext.filePath,
                range: currentContext.range,
                body: body
            });
            
            // Clear input
            input.value = '';
            document.getElementById('submit-btn').disabled = true;
        }
        
        function openDiscussion(discussionId) {
            vscode.postMessage({
                type: 'openDiscussion',
                discussionId: discussionId
            });
        }
        
        function deleteDiscussion(event, discussionId) {
            event.stopPropagation();
            vscode.postMessage({
                type: 'deleteDiscussion',
                discussionId: discussionId
            });
        }
        
        function toggleResolve(event, discussionId) {
            event.stopPropagation();
            vscode.postMessage({
                type: 'resolveDiscussion',
                discussionId: discussionId
            });
        }
        
        function submitReply(event, discussionId, parentId) {
            event.preventDefault();
            event.stopPropagation();
            
            // Find the active textarea - check which input area is visible
            const visibleInput = document.querySelector('.reply-input-area.visible');
            const textarea = visibleInput ? visibleInput.querySelector('textarea') : null;
            
            if (!textarea) {
                return;
            }
            
            const replyBody = textarea.value.trim();
            
            if (!replyBody) {
                return;
            }
            
            vscode.postMessage({
                type: 'addReply',
                discussionId: discussionId,
                replyBody: replyBody,
                parentId: parentId
            });
            
            // Clear and hide the textarea
            textarea.value = '';
            hideAllReplyInputs();
        }
        
        function showReplyInput(event, commentId) {
            event.stopPropagation();
            // Hide all reply inputs first
            hideAllReplyInputs();
            // Show this one
            const inputArea = document.getElementById('input-' + commentId);
            if (inputArea) {
                inputArea.classList.add('visible');
                const textarea = inputArea.querySelector('textarea');
                if (textarea) {
                    textarea.focus();
                }
            }
        }
        
        function hideAllReplyInputs() {
            document.querySelectorAll('.reply-input-area.visible').forEach(el => {
                el.classList.remove('visible');
            });
        }
        
        // Hide reply inputs when clicking outside
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.reply-input-area') && !event.target.closest('.comment-reply-btn')) {
                hideAllReplyInputs();
            }
        });
        
        function formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) return 'Today';
            if (days === 1) return 'Yesterday';
            if (days < 7) return days + ' days ago';
            
            return date.toLocaleDateString();
        }
        
        function buildCommentTree(comments) {
            // Create a map of comments by ID for quick lookup
            const commentMap = new Map();
            const rootComments = [];
            
            // First pass: create map
            comments.forEach(comment => {
                commentMap.set(comment.id, { ...comment, children: [] });
            });
            
            // Second pass: build tree
            comments.forEach(comment => {
                const node = commentMap.get(comment.id);
                if (comment.parentId && commentMap.has(comment.parentId)) {
                    // Add to parent's children
                    commentMap.get(comment.parentId).children.push(node);
                } else {
                    // Root level comment
                    rootComments.push(node);
                }
            });
            
            return rootComments;
        }
        
        function renderCommentTree(discussionId, comment, isFirst = false) {
            const html = \`
                <div class="comment-item">
                    <div class="comment-body \${isFirst ? 'first-comment' : ''}">
                        <div class="reply-author">
                            👤 \${comment.author?.name || 'Unknown'}
                            <span style="color: var(--vscode-descriptionForeground); margin-left: 8px; font-size: 10px;">
                                \${formatDate(comment.createdAt)}
                            </span>
                        </div>
                        <div class="reply-text" style="margin-top: 4px;">\${comment.body}</div>
                        \${!isFirst ? \`
                            <button class="comment-reply-btn" onclick="showReplyInput(event, '\${comment.id}')">
                                ↩ Reply
                            </button>
                        \` : ''}
                    </div>
                    <div class="reply-input-area" id="input-\${comment.id}">
                        <form class="reply-form" onsubmit="submitReply(event, '\${discussionId}', '\${comment.id}')">
                            <textarea 
                                class="reply-input" 
                                id="reply-\${comment.id}"
                                placeholder="Reply to \${comment.author?.name || 'this comment'}..."
                                onclick="event.stopPropagation()"
                            ></textarea>
                            <button type="submit" class="reply-submit" onclick="event.stopPropagation()">
                                Reply
                            </button>
                        </form>
                    </div>
                    \${comment.children && comment.children.length > 0 ? \`
                        <div class="comment-nested">
                            \${comment.children.map(child => renderCommentTree(discussionId, child)).join('')}
                        </div>
                    \` : ''}
                </div>
            \`;
            return html;
        }
        
        function renderDiscussions(discussions) {
            const container = document.getElementById('discussions-container');
            
            if (!discussions || discussions.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">💭</div>
                        <p>No discussions yet</p>
                        <p style="font-size: 11px; margin-top: 8px;">
                            Select code and add a comment to start
                        </p>
                    </div>
                \`;
                return;
            }
            
            // Sort: By file path, then by line number (position in document)
            const sorted = [...discussions].sort((a, b) => {
                // First sort by file path
                if (a.filePath !== b.filePath) {
                    return a.filePath.localeCompare(b.filePath);
                }
                // Then by line number
                return a.range.start.line - b.range.start.line;
            });
            
            container.innerHTML = sorted.map(discussion => {
                const isResolved = discussion.status === 'resolved';
                const commentTree = buildCommentTree(discussion.comments);
                const rootComment = commentTree[0]; // First comment is the discussion starter
                const commentText = rootComment?.body || 'No content';
                
                return \`
                    <div class="discussion-wrapper">
                        <div class="discussion-card \${isResolved ? 'resolved' : ''}" 
                             data-discussion-id="\${discussion.id}"
                             onclick="openDiscussion('\${discussion.id}')">
                        <div class="discussion-header">
                            <span class="discussion-status \${isResolved ? 'status-resolved' : 'status-active'}">
                                \${isResolved ? '✓ Resolved' : '● Active'}
                            </span>
                        </div>
                        
                        <div class="discussion-content">
                            <div class="discussion-text">\${commentText}</div>
                        </div>
                        
                        <div class="discussion-meta">
                            <div class="meta-item">
                                <span>👤</span>
                                <span>\${rootComment?.author?.name || 'Unknown'}</span>
                            </div>
                            <div class="meta-item comment-count">
                                <span>💬</span>
                                <span>\${discussion.comments.length}</span>
                            </div>
                            <div class="meta-item">
                                <span>📅</span>
                                <span>\${formatDate(discussion.createdAt)}</span>
                            </div>
                        </div>
                        
                        <div class="discussion-file">
                            📄 \${discussion.filePath}
                        </div>
                        
                        <div class="discussion-actions">
                            <button class="action-btn reply" 
                                    onclick="showReplyInput(event, '\${discussion.id}')">
                                ↩ Reply
                            </button>
                            <button class="action-btn resolve" 
                                    onclick="toggleResolve(event, '\${discussion.id}')"
                                    data-discussion-id="\${discussion.id}">
                                \${isResolved ? 'Unresolve' : 'Resolve'}
                            </button>
                            <button class="action-btn delete" 
                                    onclick="deleteDiscussion(event, '\${discussion.id}')">
                                Delete
                            </button>
                        </div>
                        </div>
                        
                        \${commentTree.length > 1 || (rootComment && rootComment.children && rootComment.children.length > 0) ? \`
                            <div class="comment-replies">
                                \${commentTree.slice(1).map(comment => renderCommentTree(discussion.id, comment)).join('')}
                                \${rootComment && rootComment.children ? rootComment.children.map(child => renderCommentTree(discussion.id, child)).join('') : ''}
                            </div>
                        \` : ''}
                        
                        <div class="reply-input-area" id="input-\${discussion.id}" style="margin-left: 0; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);">
                            <form class="reply-form" onsubmit="submitReply(event, '\${discussion.id}', '\${rootComment?.id}')">
                                <textarea 
                                    class="reply-input" 
                                    id="reply-\${discussion.id}"
                                    placeholder="Add a reply..."
                                    onclick="event.stopPropagation(); showReplyInput(event, '\${discussion.id}')"
                                ></textarea>
                                <button type="submit" class="reply-submit" onclick="event.stopPropagation()">
                                    Reply
                                </button>
                            </form>
                        </div>
                    </div>
                \`;
            }).join('');
        }
        
        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                renderDiscussions(message.discussions);
            } else if (message.type === 'updateContext') {
                updateContext(message.context);
            } else if (message.type === 'highlightDiscussion') {
                highlightDiscussion(message.discussionId);
            }
        });

        // Highlight a specific discussion (scroll into view and add visual highlight)
        function highlightDiscussion(discussionId) {
            // Remove any existing highlights
            document.querySelectorAll('.discussion-item').forEach(item => {
                item.classList.remove('highlighted');
            });

            // Find and highlight the discussion
            const discussionElement = document.querySelector(\`[data-discussion-id="\${discussionId}"]\`);
            if (discussionElement) {
                discussionElement.classList.add('highlighted');
                discussionElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
                // Remove highlight after 2 seconds
                setTimeout(() => {
                    discussionElement.classList.remove('highlighted');
                }, 2000);
            }
        }
        
        // Request initial data
        refresh();
    </script>
</body>
</html>`;
    }
}
exports.DiscussionsWebviewProvider = DiscussionsWebviewProvider;
//# sourceMappingURL=discussions-webview.provider.js.map