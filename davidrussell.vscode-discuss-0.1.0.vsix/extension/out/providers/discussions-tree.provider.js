"use strict";
/**
 * Tree data provider for discussions view
 * @format
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
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const models_1 = require("../models");
const utils_1 = require("../utils");
/**
 * Tree item for discussion view
 */
class DiscussionTreeItem extends vscode.TreeItem {
    data;
    collapsibleState;
    constructor(data, collapsibleState) {
        super('', collapsibleState);
        this.data = data;
        this.collapsibleState = collapsibleState;
        if (data.type === 'file') {
            // File node
            const fileName = path.basename(data.filePath);
            const discussionCount = data.discussions?.length ?? 0;
            this.label = fileName;
            this.description = `${discussionCount} discussion${discussionCount !== 1 ? 's' : ''}`;
            this.tooltip = data.filePath;
            this.iconPath = vscode.ThemeIcon.File;
            this.contextValue = 'file';
        }
        else if (data.type === 'discussion') {
            // Discussion node
            const discussion = data.discussion;
            const commentCount = discussion.comments.length;
            const firstComment = discussion.comments[0];
            const preview = firstComment?.body.substring(0, 60) ?? 'Empty discussion';
            this.label = preview + (firstComment?.body.length > 60 ? '...' : '');
            this.description = `Line ${discussion.range.start.line + 1} • ${commentCount} comment${commentCount !== 1 ? 's' : ''}`;
            this.tooltip = `${firstComment?.author.name}\n${new Date(discussion.createdAt).toLocaleString()}\n\n${firstComment?.body ?? ''}`;
            this.iconPath = new vscode.ThemeIcon(discussion.status === models_1.DiscussionStatus.Resolved
                ? 'check'
                : discussion.status === models_1.DiscussionStatus.Active
                    ? 'comment-discussion'
                    : 'archive');
            // Make discussion items clickable
            this.command = {
                command: 'vscode-discuss.openDiscussion',
                title: 'Open Discussion',
                arguments: [discussion],
            };
            this.contextValue = 'discussion';
        }
        else if (data.type === 'comment') {
            // Comment node
            const comment = data.comment;
            const preview = comment.body.substring(0, 80);
            this.label = preview + (comment.body.length > 80 ? '...' : '');
            this.description = comment.author.name;
            this.tooltip = `${comment.author.name}\n${new Date(comment.createdAt).toLocaleString()}\n\n${comment.body}`;
            this.iconPath = new vscode.ThemeIcon('comment');
            this.contextValue = 'comment';
        }
    }
}
exports.DiscussionTreeItem = DiscussionTreeItem;
/**
 * Tree data provider for discussions
 */
class DiscussionsTreeDataProvider {
    storageService;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    logger = (0, utils_1.getLogger)();
    constructor(storageService) {
        this.storageService = storageService;
        this.logger.debug('DiscussionsTreeDataProvider created');
    }
    /**
     * Refresh the tree view
     */
    refresh() {
        this.logger.debug('Refreshing discussions tree view');
        this._onDidChangeTreeData.fire();
    }
    /**
     * Get tree item representation
     */
    getTreeItem(element) {
        return element;
    }
    /**
     * Get children for tree item
     */
    async getChildren(element) {
        if (!element) {
            // Root level - show files
            return this.getFileItems();
        }
        if (element.data.type === 'file') {
            // Show discussions for a file
            return this.getDiscussionsForFile(element.data.filePath, element.data.discussions);
        }
        if (element.data.type === 'discussion') {
            // Show root-level comments for a discussion
            return this.getRootCommentsForDiscussion(element.data.discussion);
        }
        if (element.data.type === 'comment') {
            // Show child comments for a comment
            return this.getChildComments(element.data.discussion, element.data.comment);
        }
        return [];
    }
    /**
     * Get file-level items (grouped by file)
     */
    async getFileItems() {
        try {
            const discussions = await this.storageService.getDiscussions();
            this.logger.debug('Loading discussions for tree view', { count: discussions.length });
            if (discussions.length === 0) {
                return [];
            }
            // Group discussions by file
            const fileMap = new Map();
            for (const discussion of discussions) {
                const existing = fileMap.get(discussion.filePath) ?? [];
                existing.push(discussion);
                fileMap.set(discussion.filePath, existing);
            }
            // Sort files alphabetically
            const sortedFiles = Array.from(fileMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            // Create file tree items
            const items = sortedFiles.map(([filePath, discussions]) => {
                return new DiscussionTreeItem({
                    type: 'file',
                    filePath,
                    discussions,
                }, vscode.TreeItemCollapsibleState.Collapsed);
            });
            this.logger.debug('File tree items created', { fileCount: items.length });
            return items;
        }
        catch (error) {
            this.logger.error('Failed to get file items for tree view', error);
            return [];
        }
    }
    /**
     * Get discussion items for a file
     */
    getDiscussionsForFile(_filePath, discussions) {
        // Sort discussions by line number
        const sortedDiscussions = discussions.sort((a, b) => a.range.start.line - b.range.start.line);
        return sortedDiscussions.map((discussion) => {
            const hasComments = discussion.comments.length > 0;
            return new DiscussionTreeItem({
                type: 'discussion',
                discussion,
            }, hasComments
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None);
        });
    }
    /**
     * Get root-level comments for a discussion
     */
    getRootCommentsForDiscussion(discussion) {
        // Get comments without a parent (root comments)
        const rootComments = discussion.comments.filter((c) => !c.parentId);
        return rootComments.map((comment) => {
            // Check if this comment has children
            const hasChildren = discussion.comments.some((c) => c.parentId === comment.id);
            return new DiscussionTreeItem({
                type: 'comment',
                comment,
                discussion, // Keep reference to discussion for finding children
            }, hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None);
        });
    }
    /**
     * Get child comments for a parent comment
     */
    getChildComments(discussion, parentComment) {
        // Get direct children of this comment
        const childComments = discussion.comments.filter((c) => c.parentId === parentComment.id);
        return childComments.map((comment) => {
            // Check if this comment has children
            const hasChildren = discussion.comments.some((c) => c.parentId === comment.id);
            return new DiscussionTreeItem({
                type: 'comment',
                comment,
                discussion, // Keep reference to discussion for finding children
            }, hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None);
        });
    }
}
exports.DiscussionsTreeDataProvider = DiscussionsTreeDataProvider;
//# sourceMappingURL=discussions-tree.provider.js.map