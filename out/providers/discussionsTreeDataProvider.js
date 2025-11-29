"use strict";
/**
 * DiscussionsTreeDataProvider - Provides data for the sidebar tree view
 *
 * Shows discussions grouped by:
 * 1. Files with Discussions - nested by file path
 * 2. Unanchored / Historical - discussions without code anchors
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
exports.DiscussionsTreeDataProvider = exports.DiscussionTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const discussion_js_1 = require("../models/discussion.js");
/**
 * Custom tree item with type information
 */
class DiscussionTreeItem extends vscode.TreeItem {
    itemType;
    label;
    collapsibleState;
    discussion;
    filePath;
    folderPath;
    hasUnreadMention;
    constructor(itemType, label, collapsibleState, discussion, filePath, folderPath, hasUnreadMention) {
        super(label, collapsibleState);
        this.itemType = itemType;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.discussion = discussion;
        this.filePath = filePath;
        this.folderPath = folderPath;
        this.hasUnreadMention = hasUnreadMention;
        this.setupItem();
    }
    setupItem() {
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
    setupDiscussionItem() {
        if (!this.discussion) {
            return;
        }
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
        }
        else if (d.status === 'closed') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        }
        else if (!d.isAnchored) {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        }
        else {
            this.iconPath = new vscode.ThemeIcon('comment-discussion');
        }
        // Command to open discussion
        this.command = {
            command: 'longLivedDiscussions.openDiscussion',
            title: 'Open Discussion',
            arguments: [d],
        };
    }
    createTooltip() {
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
exports.DiscussionTreeItem = DiscussionTreeItem;
class DiscussionsTreeDataProvider {
    yamlStorage;
    anchorIndexer;
    sidecarService;
    gitService;
    readMentionsStorage;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    discussions = [];
    currentUserName = '';
    constructor(yamlStorage, anchorIndexer, sidecarService, gitService, readMentionsStorage) {
        this.yamlStorage = yamlStorage;
        this.anchorIndexer = anchorIndexer;
        this.sidecarService = sidecarService;
        this.gitService = gitService;
        this.readMentionsStorage = readMentionsStorage;
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
    async loadCurrentUser() {
        const user = await this.gitService.getCurrentUser();
        this.currentUserName = user.name;
    }
    /**
     * Check if a discussion has unread mentions for the current user
     */
    hasUnreadMentionFor(discussion) {
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
            if ((0, discussion_js_1.hasMentionFor)(comment.body, this.currentUserName)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Refresh the tree view
     */
    async refresh() {
        await this.loadCurrentUser();
        await this.loadDiscussions();
        this._onDidChangeTreeData.fire();
    }
    /**
     * Load discussions and correlate with anchors
     */
    async loadDiscussions() {
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
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!this.sidecarService.isLinked) {
            return [];
        }
        // Root level - show two groups
        if (!element) {
            return [
                new DiscussionTreeItem('root-anchored', 'Files with Discussions', vscode.TreeItemCollapsibleState.Expanded),
                new DiscussionTreeItem('root-unanchored', 'Unanchored / Historical', vscode.TreeItemCollapsibleState.Collapsed),
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
    getAnchoredFileItems() {
        const anchored = this.discussions.filter(d => d.isAnchored);
        // Group by file
        const byFile = new Map();
        for (const d of anchored) {
            const filePath = d.currentAnchor?.relativePath || d.anchor.file_path;
            const existing = byFile.get(filePath) || [];
            existing.push(d);
            byFile.set(filePath, existing);
        }
        // Create file items
        const items = [];
        for (const [relativePath, discussions] of byFile) {
            const absolutePath = this.sidecarService.getAbsolutePath(relativePath);
            items.push(new DiscussionTreeItem('file', relativePath, vscode.TreeItemCollapsibleState.Expanded, undefined, absolutePath || undefined));
        }
        // Sort by file path
        items.sort((a, b) => a.label.localeCompare(b.label));
        return items;
    }
    /**
     * Get discussions for a specific file
     */
    getDiscussionsForFile(absolutePath) {
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
            return new DiscussionTreeItem('discussion', d.title, vscode.TreeItemCollapsibleState.None, d, undefined, undefined, hasUnreadMention);
        });
    }
    /**
     * Get unanchored/historical discussion items
     */
    getUnanchoredItems() {
        const unanchored = this.discussions.filter(d => !d.isAnchored);
        return unanchored.map(d => {
            const hasUnreadMention = this.hasUnreadMentionFor(d);
            return new DiscussionTreeItem('discussion', d.title, vscode.TreeItemCollapsibleState.None, d, undefined, undefined, hasUnreadMention);
        });
    }
    /**
     * Get items in a folder (for nested folder structure - future enhancement)
     */
    getItemsInFolder(folderPath) {
        // For now, flat file structure. Can enhance later for nested folders.
        return [];
    }
    /**
     * Get a discussion by ID
     */
    getDiscussion(discussionId) {
        return this.discussions.find(d => d.id === discussionId);
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}
exports.DiscussionsTreeDataProvider = DiscussionsTreeDataProvider;
//# sourceMappingURL=discussionsTreeDataProvider.js.map