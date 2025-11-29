/**
 * DiscussionsTreeDataProvider - Provides data for the sidebar tree view
 * 
 * Shows discussions grouped by:
 * 1. Files with Discussions - nested by file path
 * 2. Unanchored / Historical - discussions without code anchors
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Discussion, DiscussionWithAnchorStatus, AnchorLocation, hasMentionFor } from '../models/discussion.js';
import { YamlStorageService } from '../services/yamlStorageService.js';
import { AnchorIndexer } from '../services/anchorIndexer.js';
import { SidecarRepoService } from '../services/sidecarRepoService.js';
import { GitService } from '../services/gitService.js';
import { ReadMentionsStorage } from '../services/readMentionsStorage.js';

/**
 * Tree item types
 */
type TreeItemType = 'root-unread-mentions' | 'root-anchored' | 'root-unanchored' | 'folder' | 'file' | 'discussion';

/**
 * Custom tree item with type information
 */
export class DiscussionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly itemType: TreeItemType,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly discussion?: DiscussionWithAnchorStatus,
        public readonly filePath?: string,
        public readonly folderPath?: string,
        public readonly hasUnreadMention?: boolean,
    ) {
        super(label, collapsibleState);
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'root-unread-mentions':
                this.iconPath = new vscode.ThemeIcon('bell', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
                this.contextValue = 'root';
                break;
            case 'root-anchored':
                this.iconPath = new vscode.ThemeIcon('file-code');
                this.contextValue = 'root';
                break;
            case 'root-unanchored':
                this.iconPath = new vscode.ThemeIcon('history');
                this.contextValue = 'root';
                break;
            case 'folder':
                this.iconPath = vscode.ThemeIcon.Folder;
                this.contextValue = 'folder';
                break;
            case 'file':
                this.iconPath = vscode.ThemeIcon.File;
                this.contextValue = 'file';
                this.resourceUri = this.filePath ? vscode.Uri.file(this.filePath) : undefined;
                break;
            case 'discussion':
                this.setupDiscussionItem();
                break;
        }
    }

    private setupDiscussionItem(): void {
        if (!this.discussion) { return; }

        const d = this.discussion;
        const status = d.status === 'closed' ? '✓ ' : '';
        const anchor = d.isAnchored ? `line ${d.anchor.start_line}` : 'anchor missing';
        
        // Use description for additional info since label is readonly after construction
        this.description = `(${anchor}) ${d.comments.length} comment${d.comments.length !== 1 ? 's' : ''}`;
        this.tooltip = this.createTooltip();
        this.contextValue = this.hasUnreadMention ? 'discussionWithMention' : 'discussion';

        // Icon based on status - unread mentions take priority
        if (this.hasUnreadMention) {
            this.iconPath = new vscode.ThemeIcon('bell', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
        } else if (d.status === 'closed') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (!d.isAnchored) {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        } else {
            this.iconPath = new vscode.ThemeIcon('comment-discussion');
        }

        // Command to open discussion
        this.command = {
            command: 'longLivedDiscussions.openDiscussion',
            title: 'Open Discussion',
            arguments: [d],
        };
    }

    private createTooltip(): vscode.MarkdownString {
        if (!this.discussion) { 
            return new vscode.MarkdownString(''); 
        }

        const d = this.discussion;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${d.title}\n\n`);
        md.appendMarkdown(`**Status:** ${d.status}\n\n`);
        md.appendMarkdown(`**File:** ${d.anchor.file_path}:${d.anchor.start_line}\n\n`);
        md.appendMarkdown(`**Created:** ${d.metadata.created_at} by ${d.metadata.created_by}\n\n`);
        
        if (d.comments.length > 0) {
            md.appendMarkdown(`---\n\n`);
            const latestComment = d.comments[d.comments.length - 1];
            md.appendMarkdown(`**Latest comment by ${latestComment.author}:**\n\n`);
            md.appendMarkdown(latestComment.body.substring(0, 200));
            if (latestComment.body.length > 200) {
                md.appendMarkdown('...');
            }
        }

        return md;
    }
}

export class DiscussionsTreeDataProvider implements vscode.TreeDataProvider<DiscussionTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DiscussionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _onDidChangeUnreadCount = new vscode.EventEmitter<number>();
    readonly onDidChangeUnreadCount = this._onDidChangeUnreadCount.event;

    private discussions: DiscussionWithAnchorStatus[] = [];
    private currentUserName: string = '';

    constructor(
        private yamlStorage: YamlStorageService,
        private anchorIndexer: AnchorIndexer,
        private sidecarService: SidecarRepoService,
        private gitService: GitService,
        private readMentionsStorage: ReadMentionsStorage,
    ) {
        // Listen for changes
        this.yamlStorage.onDiscussionsChanged(() => this.refresh());
        this.anchorIndexer.onAnchorsChanged(() => this.refresh());
        this.readMentionsStorage.onDidChange(() => this.refresh());
        
        // Load current user
        this.loadCurrentUser();
    }

    /**
     * Load the current user's name for mention matching
     */
    private async loadCurrentUser(): Promise<void> {
        const user = await this.gitService.getCurrentUser();
        this.currentUserName = user.name;
    }

    /**
     * Check if a discussion has unread mentions for the current user
     */
    private hasUnreadMentionFor(discussion: Discussion): boolean {
        if (!this.currentUserName) {
            return false;
        }

        const readCommentIds = this.readMentionsStorage.getReadCommentIds();
        
        for (const comment of discussion.comments) {
            // Skip if this comment's mentions have been marked as read
            if (readCommentIds.includes(comment.id)) {
                continue;
            }
            // Check if this comment has a mention for the current user
            if (hasMentionFor(comment.body, this.currentUserName)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Count discussions with unread mentions for the current user
     */
    getUnreadMentionCount(): number {
        if (!this.currentUserName) {
            return 0;
        }

        let count = 0;
        for (const discussion of this.discussions) {
            if (this.hasUnreadMentionFor(discussion)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Get discussions with unread mentions for the current user
     */
    private getDiscussionsWithUnreadMentions(): DiscussionWithAnchorStatus[] {
        if (!this.currentUserName) {
            return [];
        }
        return this.discussions.filter(d => this.hasUnreadMentionFor(d));
    }

    /**
     * Refresh the tree view
     */
    async refresh(): Promise<void> {
        await this.loadCurrentUser();
        await this.loadDiscussions();
        this._onDidChangeTreeData.fire();
        this._onDidChangeUnreadCount.fire(this.getUnreadMentionCount());
    }

    /**
     * Load discussions and correlate with anchors
     */
    private async loadDiscussions(): Promise<void> {
        if (!this.sidecarService.isLinked) {
            this.discussions = [];
            return;
        }

        const rawDiscussions = await this.yamlStorage.loadAllDiscussions();
        
        this.discussions = rawDiscussions.map(d => {
            const anchor = this.anchorIndexer.getAnchor(d.id);
            return {
                ...d,
                currentAnchor: anchor || null,
                isAnchored: !!anchor,
            };
        });
    }

    getTreeItem(element: DiscussionTreeItem): vscode.TreeItem {
        return element;
    }

    getParent(element: DiscussionTreeItem): DiscussionTreeItem | undefined {
        // Root items have no parent
        if (element.itemType === 'root-unread-mentions' || 
            element.itemType === 'root-anchored' || 
            element.itemType === 'root-unanchored') {
            return undefined;
        }

        // Discussion items - find their parent based on where they appear
        if (element.itemType === 'discussion' && element.discussion) {
            const d = element.discussion;
            
            // Check if this is an unanchored discussion
            if (!d.isAnchored) {
                return new DiscussionTreeItem(
                    'root-unanchored',
                    'Unanchored / Historical',
                    vscode.TreeItemCollapsibleState.Collapsed
                );
            }

            // Check if this discussion has unread mentions (could be in that category)
            if (this.hasUnreadMentionFor(d)) {
                // Could be in either Unread Mentions or Files category
                // For reveal, we'll use the Files category as the primary parent
            }

            // Anchored discussion - parent is the file item
            const relativePath = d.currentAnchor?.relativePath || d.anchor.file_path;
            const absolutePath = this.sidecarService.getAbsolutePath(relativePath);
            return new DiscussionTreeItem(
                'file',
                relativePath,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                absolutePath || undefined,
            );
        }

        // File items - parent is root-anchored
        if (element.itemType === 'file') {
            return new DiscussionTreeItem(
                'root-anchored',
                'Files with Discussions',
                vscode.TreeItemCollapsibleState.Expanded
            );
        }

        return undefined;
    }

    async getChildren(element?: DiscussionTreeItem): Promise<DiscussionTreeItem[]> {
        if (!this.sidecarService.isLinked) {
            return [];
        }

        // Root level - show groups (Unread Mentions only if there are any)
        if (!element) {
            const items: DiscussionTreeItem[] = [];
            
            // Only show Unread Mentions if there are any
            const unreadCount = this.getUnreadMentionCount();
            if (unreadCount > 0) {
                items.push(new DiscussionTreeItem(
                    'root-unread-mentions',
                    `Unread Mentions (${unreadCount})`,
                    vscode.TreeItemCollapsibleState.Expanded
                ));
            }
            
            items.push(new DiscussionTreeItem(
                'root-anchored',
                'Files with Discussions',
                vscode.TreeItemCollapsibleState.Expanded
            ));
            items.push(new DiscussionTreeItem(
                'root-unanchored',
                'Unanchored / Historical',
                vscode.TreeItemCollapsibleState.Collapsed
            ));
            
            return items;
        }

        // Unread mentions group
        if (element.itemType === 'root-unread-mentions') {
            return this.getUnreadMentionItems();
        }

        // Anchored discussions group
        if (element.itemType === 'root-anchored') {
            return this.getAnchoredFileItems();
        }

        // Unanchored discussions group
        if (element.itemType === 'root-unanchored') {
            return this.getUnanchoredItems();
        }

        // File level - show discussions in this file
        if (element.itemType === 'file' && element.filePath) {
            return this.getDiscussionsForFile(element.filePath);
        }

        // Folder level - show subfolders and files
        if (element.itemType === 'folder' && element.folderPath) {
            return this.getItemsInFolder(element.folderPath);
        }

        return [];
    }

    /**
     * Get discussion items with unread mentions
     */
    private getUnreadMentionItems(): DiscussionTreeItem[] {
        const withUnread = this.getDiscussionsWithUnreadMentions();
        
        return withUnread.map(d => new DiscussionTreeItem(
            'discussion',
            d.title,
            vscode.TreeItemCollapsibleState.None,
            d,
            undefined,
            undefined,
            true, // hasUnreadMention is always true for these
        ));
    }

    /**
     * Get file items for anchored discussions
     */
    private getAnchoredFileItems(): DiscussionTreeItem[] {
        const anchored = this.discussions.filter(d => d.isAnchored);
        
        // Group by file
        const byFile = new Map<string, DiscussionWithAnchorStatus[]>();
        for (const d of anchored) {
            const filePath = d.currentAnchor?.relativePath || d.anchor.file_path;
            const existing = byFile.get(filePath) || [];
            existing.push(d);
            byFile.set(filePath, existing);
        }

        // Create file items
        const items: DiscussionTreeItem[] = [];
        for (const [relativePath, discussions] of byFile) {
            const absolutePath = this.sidecarService.getAbsolutePath(relativePath);
            items.push(new DiscussionTreeItem(
                'file',
                relativePath,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                absolutePath || undefined,
            ));
        }

        // Sort by file path
        items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
        
        return items;
    }

    /**
     * Get discussions for a specific file
     */
    private getDiscussionsForFile(absolutePath: string): DiscussionTreeItem[] {
        const relativePath = this.sidecarService.getRelativePath(absolutePath);
        
        const discussions = this.discussions.filter(d => {
            const dPath = d.currentAnchor?.relativePath || d.anchor.file_path;
            return dPath === relativePath;
        });

        // Sort by line number
        discussions.sort((a, b) => {
            const lineA = a.currentAnchor?.line || a.anchor.start_line;
            const lineB = b.currentAnchor?.line || b.anchor.start_line;
            return lineA - lineB;
        });

        return discussions.map(d => {
            const hasUnreadMention = this.hasUnreadMentionFor(d);
            return new DiscussionTreeItem(
                'discussion',
                d.title,
                vscode.TreeItemCollapsibleState.None,
                d,
                undefined,
                undefined,
                hasUnreadMention,
            );
        });
    }

    /**
     * Get unanchored/historical discussion items
     */
    private getUnanchoredItems(): DiscussionTreeItem[] {
        const unanchored = this.discussions.filter(d => !d.isAnchored);
        
        return unanchored.map(d => {
            const hasUnreadMention = this.hasUnreadMentionFor(d);
            return new DiscussionTreeItem(
                'discussion',
                d.title,
                vscode.TreeItemCollapsibleState.None,
                d,
                undefined,
                undefined,
                hasUnreadMention,
            );
        });
    }

    /**
     * Get items in a folder (for nested folder structure - future enhancement)
     */
    private getItemsInFolder(folderPath: string): DiscussionTreeItem[] {
        // For now, flat file structure. Can enhance later for nested folders.
        return [];
    }

    /**
     * Get a discussion by ID
     */
    getDiscussion(discussionId: string): DiscussionWithAnchorStatus | undefined {
        return this.discussions.find(d => d.id === discussionId);
    }

    /**
     * Create a tree item for a discussion (used for revealing in tree view)
     */
    getTreeItemForDiscussion(discussion: DiscussionWithAnchorStatus): DiscussionTreeItem {
        const hasUnreadMention = this.hasUnreadMentionFor(discussion);
        return new DiscussionTreeItem(
            'discussion',
            discussion.title,
            vscode.TreeItemCollapsibleState.None,
            discussion,
            undefined,
            undefined,
            hasUnreadMention,
        );
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this._onDidChangeUnreadCount.dispose();
    }
}
