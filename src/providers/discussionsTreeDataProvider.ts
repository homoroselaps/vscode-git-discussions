/**
 * DiscussionsTreeDataProvider - Provides data for the sidebar tree view
 * 
 * Shows discussions grouped by:
 * 1. Files with Discussions - nested by file path
 * 2. Unanchored / Historical - discussions without code anchors
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Discussion, DiscussionWithAnchorStatus, AnchorLocation } from '../models/discussion.js';
import { YamlStorageService } from '../services/yamlStorageService.js';
import { AnchorIndexer } from '../services/anchorIndexer.js';
import { SidecarRepoService } from '../services/sidecarRepoService.js';

/**
 * Tree item types
 */
type TreeItemType = 'root-anchored' | 'root-unanchored' | 'folder' | 'file' | 'discussion';

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
    ) {
        super(label, collapsibleState);
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
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
        this.contextValue = 'discussion';

        // Icon based on status
        if (d.status === 'closed') {
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

    private discussions: DiscussionWithAnchorStatus[] = [];

    constructor(
        private yamlStorage: YamlStorageService,
        private anchorIndexer: AnchorIndexer,
        private sidecarService: SidecarRepoService,
    ) {
        // Listen for changes
        this.yamlStorage.onDiscussionsChanged(() => this.refresh());
        this.anchorIndexer.onAnchorsChanged(() => this.refresh());
    }

    /**
     * Refresh the tree view
     */
    async refresh(): Promise<void> {
        await this.loadDiscussions();
        this._onDidChangeTreeData.fire();
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

    async getChildren(element?: DiscussionTreeItem): Promise<DiscussionTreeItem[]> {
        if (!this.sidecarService.isLinked) {
            return [];
        }

        // Root level - show two groups
        if (!element) {
            return [
                new DiscussionTreeItem(
                    'root-anchored',
                    'Files with Discussions',
                    vscode.TreeItemCollapsibleState.Expanded
                ),
                new DiscussionTreeItem(
                    'root-unanchored',
                    'Unanchored / Historical',
                    vscode.TreeItemCollapsibleState.Collapsed
                ),
            ];
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

        return discussions.map(d => new DiscussionTreeItem(
            'discussion',
            d.title,
            vscode.TreeItemCollapsibleState.None,
            d,
        ));
    }

    /**
     * Get unanchored/historical discussion items
     */
    private getUnanchoredItems(): DiscussionTreeItem[] {
        const unanchored = this.discussions.filter(d => !d.isAnchored);
        
        return unanchored.map(d => new DiscussionTreeItem(
            'discussion',
            d.title,
            vscode.TreeItemCollapsibleState.None,
            d,
        ));
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

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
