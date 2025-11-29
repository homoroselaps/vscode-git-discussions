/**
 * Command handlers for Long-Lived Discussions
 */

import * as vscode from 'vscode';
import { 
    Discussion, 
    DiscussionWithAnchorStatus, 
    Anchor, 
    createNewDiscussion, 
    addCommentToDiscussion,
    formatAnchorComment,
    hasMentionFor,
} from '../models/discussion.js';
import { SidecarRepoService } from '../services/sidecarRepoService.js';
import { YamlStorageService } from '../services/yamlStorageService.js';
import { AnchorIndexer } from '../services/anchorIndexer.js';
import { GitService } from '../services/gitService.js';
import { DiscussionsTreeDataProvider } from '../providers/discussionsTreeDataProvider.js';
import { ReadMentionsStorage } from '../services/readMentionsStorage.js';

export class CommandHandlers {
    constructor(
        private sidecarService: SidecarRepoService,
        private yamlStorage: YamlStorageService,
        private anchorIndexer: AnchorIndexer,
        private gitService: GitService,
        private treeDataProvider: DiscussionsTreeDataProvider,
        private readMentionsStorage: ReadMentionsStorage,
    ) {}

    /**
     * Create a new discussion for the current selection
     */
    async createDiscussion(): Promise<void> {
        // Check if linked
        if (!this.sidecarService.isLinked) {
            this.sidecarService.showStatusNotification();
            return;
        }

        // Get active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor. Open a file to create a discussion.');
            return;
        }

        // Get selection or current line
        const selection = editor.selection;
        const startLine = selection.start.line + 1; // 1-based
        const endLine = selection.end.line + 1;

        // Ask for title
        const title = await vscode.window.showInputBox({
            prompt: 'Enter a title for the discussion',
            placeHolder: 'e.g., "Clarify error handling logic"',
        });

        if (!title) {
            return; // User cancelled
        }

        // Ask for initial comment (optional)
        const initialComment = await vscode.window.showInputBox({
            prompt: 'Enter an initial comment (optional)',
            placeHolder: 'e.g., "This section needs review because..."',
        });

        try {
            // Generate unique ID
            const discussionId = await this.yamlStorage.generateUniqueId();

            // Get Git info
            const user = await this.gitService.getCurrentUser();
            const commitSha = await this.gitService.getCodeRepoHeadSha();
            const codeRepoUrl = await this.gitService.getCodeRepoRemoteUrl();
            const discussionRepoUrl = await this.gitService.getDiscussionRepoRemoteUrl();

            // Create anchor comment
            const languageId = editor.document.languageId;
            const anchorComment = formatAnchorComment(languageId, discussionId);
            
            // Insert anchor comment above the selection
            const insertLine = selection.start.line;
            const insertPosition = new vscode.Position(insertLine, 0);
            
            await editor.edit(editBuilder => {
                editBuilder.insert(insertPosition, anchorComment + '\n');
            });

            // Save the file
            await editor.document.save();

            // Create anchor info
            const anchor: Anchor = {
                commit_sha: commitSha,
                file_path: this.sidecarService.getRelativePath(editor.document.uri.fsPath),
                start_line: startLine,
                end_line: endLine,
                language: languageId,
                symbol_path: null,
                anchor_line: insertLine + 1, // 1-based
            };

            // Create discussion
            const discussion = createNewDiscussion(
                discussionId,
                title,
                anchor,
                user.name,
                initialComment
            );

            // Add optional code repo URL for reference
            if (codeRepoUrl) {
                discussion.code_repo = codeRepoUrl;
            }

            // Write YAML file
            await this.yamlStorage.writeDiscussion(discussion);

            // Commit to discussions repo
            await this.gitService.commitDiscussion(
                discussionId, 
                'Add', 
                `${anchor.file_path}:${startLine}`
            );

            // Refresh
            await this.anchorIndexer.scanWorkspace();
            await this.treeDataProvider.refresh();

            vscode.window.showInformationMessage(`Discussion created: ${discussionId}`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create discussion: ${error}`);
        }
    }

    /**
     * Add a comment to an existing discussion
     */
    async addComment(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!this.sidecarService.isLinked) {
            this.sidecarService.showStatusNotification();
            return;
        }

        // If no discussion provided, prompt user to select one
        if (!discussion) {
            const allDiscussions = await this.yamlStorage.loadAllDiscussions();
            if (allDiscussions.length === 0) {
                vscode.window.showInformationMessage('No discussions found.');
                return;
            }

            const items = allDiscussions.map(d => ({
                label: d.title,
                description: d.id,
                discussion: d,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a discussion to comment on',
            });

            if (!selected) {
                return;
            }

            // Load full discussion with anchor status
            const anchor = this.anchorIndexer.getAnchor(selected.discussion.id);
            discussion = {
                ...selected.discussion,
                currentAnchor: anchor || null,
                isAnchored: !!anchor,
            };
        }

        // Ask for comment text
        const commentText = await vscode.window.showInputBox({
            prompt: `Add comment to "${discussion.title}"`,
            placeHolder: 'Enter your comment...',
        });

        if (!commentText) {
            return;
        }

        try {
            // Get current user
            const user = await this.gitService.getCurrentUser();

            // Load and update discussion
            const currentDiscussion = await this.yamlStorage.readDiscussion(discussion.id);
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }

            const updatedDiscussion = addCommentToDiscussion(currentDiscussion, user.name, commentText);
            
            // Write updated YAML
            await this.yamlStorage.writeDiscussion(updatedDiscussion);

            // Commit
            const newCommentId = updatedDiscussion.comments[updatedDiscussion.comments.length - 1].id;
            await this.gitService.commitDiscussion(
                discussion.id,
                'Add comment',
                `comment #${newCommentId}`
            );

            // Refresh
            await this.treeDataProvider.refresh();

            vscode.window.showInformationMessage('Comment added.');

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add comment: ${error}`);
        }
    }

    /**
     * Close a discussion
     */
    async closeDiscussion(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!this.sidecarService.isLinked) {
            this.sidecarService.showStatusNotification();
            return;
        }

        if (!discussion) {
            vscode.window.showErrorMessage('No discussion selected.');
            return;
        }

        try {
            // Load and update discussion
            const currentDiscussion = await this.yamlStorage.readDiscussion(discussion.id);
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }

            currentDiscussion.status = 'closed';
            
            // Write updated YAML
            await this.yamlStorage.writeDiscussion(currentDiscussion);

            // Commit
            await this.gitService.commitDiscussion(discussion.id, 'Close');

            // Refresh
            await this.treeDataProvider.refresh();

            vscode.window.showInformationMessage(`Discussion ${discussion.id} closed.`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to close discussion: ${error}`);
        }
    }

    /**
     * Close a discussion and remove the anchor from code
     */
    async closeAndRemoveAnchor(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!this.sidecarService.isLinked) {
            this.sidecarService.showStatusNotification();
            return;
        }

        if (!discussion) {
            vscode.window.showErrorMessage('No discussion selected.');
            return;
        }

        try {
            // First close the discussion
            const currentDiscussion = await this.yamlStorage.readDiscussion(discussion.id);
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }

            currentDiscussion.status = 'closed';
            await this.yamlStorage.writeDiscussion(currentDiscussion);
            await this.gitService.commitDiscussion(discussion.id, 'Close');

            // Then remove anchor from code if it exists
            if (discussion.isAnchored && discussion.currentAnchor) {
                const absolutePath = this.sidecarService.getAbsolutePath(discussion.currentAnchor.relativePath);
                if (absolutePath) {
                    const uri = vscode.Uri.file(absolutePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(document);
                    
                    // Find and remove the anchor line
                    const anchorLine = discussion.currentAnchor.line - 1; // 0-based
                    if (anchorLine >= 0 && anchorLine < document.lineCount) {
                        const line = document.lineAt(anchorLine);
                        const pattern = new RegExp(`\\[discussion:${discussion.id}\\]`, 'i');
                        
                        if (pattern.test(line.text)) {
                            await editor.edit(editBuilder => {
                                // Remove the entire line including the newline
                                const range = new vscode.Range(
                                    anchorLine, 0,
                                    anchorLine + 1, 0
                                );
                                editBuilder.delete(range);
                            });
                            
                            await document.save();
                            
                            vscode.window.showInformationMessage(
                                `Discussion ${discussion.id} closed and anchor removed. Please commit your code changes.`
                            );
                        }
                    }
                }
            } else {
                vscode.window.showInformationMessage(`Discussion ${discussion.id} closed (no anchor to remove).`);
            }

            // Refresh
            await this.anchorIndexer.scanWorkspace();
            await this.treeDataProvider.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to close discussion: ${error}`);
        }
    }

    /**
     * Open a discussion (navigate to anchor or show details)
     */
    async openDiscussion(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!discussion) {
            return;
        }

        if (discussion.isAnchored && discussion.currentAnchor) {
            // Navigate to anchor in code
            await this.goToAnchor(discussion);
        } else {
            // Open YAML file for unanchored discussions
            await this.openYamlFile(discussion);
        }
    }

    /**
     * Navigate to the anchor location in code
     */
    async goToAnchor(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!discussion) {
            return;
        }

        const anchor = discussion.currentAnchor;
        if (!anchor) {
            vscode.window.showWarningMessage('Discussion has no anchor in code.');
            return;
        }

        try {
            const absolutePath = this.sidecarService.getAbsolutePath(anchor.relativePath);
            if (!absolutePath) {
                throw new Error('Could not resolve file path');
            }

            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            // Navigate to the anchor line
            const line = anchor.line - 1; // 0-based
            const range = new vscode.Range(line, 0, line, 0);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(line, 0, line, 0);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to navigate to anchor: ${error}`);
        }
    }

    /**
     * Open the YAML file for a discussion
     */
    async openYamlFile(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!discussion) {
            return;
        }

        try {
            await this.yamlStorage.openDiscussionFile(discussion.id);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open YAML file: ${error}`);
        }
    }

    /**
     * Refresh discussions
     */
    async refresh(): Promise<void> {
        await this.anchorIndexer.scanWorkspace();
        await this.treeDataProvider.refresh();
    }

    /**
     * Mark all mentions of current user as read in a discussion (stored locally, not in YAML)
     */
    async markAllMentionsRead(discussion?: DiscussionWithAnchorStatus): Promise<void> {
        if (!this.sidecarService.isLinked) {
            this.sidecarService.showStatusNotification();
            return;
        }

        if (!discussion) {
            return;
        }

        try {
            const currentDiscussion = await this.yamlStorage.readDiscussion(discussion.id);
            if (!currentDiscussion) {
                throw new Error('Discussion not found');
            }

            // Get current user
            const user = await this.gitService.getCurrentUser();

            // Find all comment IDs that have mentions for current user
            const commentIdsWithMentions: string[] = [];
            for (const comment of currentDiscussion.comments) {
                if (hasMentionFor(comment.body, user.name)) {
                    commentIdsWithMentions.push(comment.id);
                }
            }

            if (commentIdsWithMentions.length === 0) {
                vscode.window.showInformationMessage('No mentions to mark as read.');
                return;
            }

            // Mark all as read in local storage (no YAML changes, no commits)
            await this.readMentionsStorage.markCommentsRead(commentIdsWithMentions);

            // Refresh tree (storage fires onDidChange which triggers refresh)
            vscode.window.showInformationMessage('All mentions marked as read.');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to mark mentions as read: ${error}`);
        }
    }
}
