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
import * as path from 'path';

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
            
            // Create new comment
            const commentId = generateCommentId();
            const newComment = {
                id: commentId,
                author: user.name,
                created_at: new Date().toISOString(),
                body: text.trim(),
            };

            // Write only the new comment file (not the entire discussion)
            const commentPath = await this.yamlStorage.writeComment(this._currentDiscussion.id, newComment);

            // Commit just the comment file
            await this.gitService.commitFile(
                commentPath,
                `Add comment to ${this._currentDiscussion.id}: ${commentId}`
            );

            // Reload discussion to get updated comments list
            const updatedDiscussion = await this.yamlStorage.readDiscussion(this._currentDiscussion.id);
            if (updatedDiscussion) {
                const anchor = this.anchorIndexer.getAnchor(updatedDiscussion.id);
                this._currentDiscussion = {
                    ...updatedDiscussion,
                    currentAnchor: anchor || null,
                    isAnchored: !!anchor,
                };
            }

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
        // Get the bundled webview assets
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'webview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'webview.css')
        );

        // Use a nonce for Content Security Policy
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Discussion</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
