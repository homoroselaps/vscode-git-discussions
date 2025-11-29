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
exports.CommentController = void 0;
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const vscode = __importStar(require("vscode"));
const models_1 = require("../models");
const commenting_range_provider_1 = require("../providers/commenting-range.provider");
const utils_1 = require("../utils");
/**
 * Controller for managing VS Code comment threads and syncing with storage
 */
class CommentController {
    storageService;
    gitUserService;
    commentController;
    threads = new Map();
    disposables = [];
    logger = (0, utils_1.getLogger)();
    onDidChangeDiscussionsEmitter = new vscode.EventEmitter();
    onDidChangeDiscussions = this.onDidChangeDiscussionsEmitter.event;
    constructor(storageService, gitUserService) {
        this.storageService = storageService;
        this.gitUserService = gitUserService;
        this.logger.trace('CommentController', 'constructor');
        // Create comment controller
        this.commentController = vscode.comments.createCommentController('vscode-discuss', 'VSCode Discuss');
        // Configure options
        this.commentController.options = {
            prompt: 'Start a discussion...',
            placeHolder: 'Type your comment here (Markdown supported)',
        };
        // Set up commenting range provider
        this.commentController.commentingRangeProvider = new commenting_range_provider_1.CommentingRangeProvider();
        this.disposables.push(this.commentController);
        this.logger.debug('CommentController created successfully');
    }
    /**
     * Initialize the controller and load existing discussions
     */
    async initialize() {
        this.logger.trace('CommentController', 'initialize');
        // Load existing discussions from storage
        const discussions = await this.storageService.getDiscussions();
        this.logger.info('Loading existing discussions', { count: discussions.length });
        // Create comment threads for each discussion
        for (const discussion of discussions) {
            this.logger.debug('Creating thread from discussion', {
                discussionId: discussion.id,
                filePath: discussion.filePath,
                commentCount: discussion.comments.length,
            });
            this.createThreadFromDiscussion(discussion);
        }
        // Watch for active editor changes to show threads
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.logger.debug('Active editor changed', { uri: editor.document.uri.toString() });
                void this.refreshThreadsForDocument(editor.document);
            }
        }));
        this.logger.info('CommentController initialized', { totalThreads: this.threads.size });
    }
    /**
     * Create a new discussion from user input
     */
    async createDiscussion(reply) {
        const endTimer = this.logger.time('createDiscussion');
        this.logger.info('=== Creating New Discussion ===');
        this.logger.debug('CommentController.createDiscussion called', {
            uri: reply.thread.uri.toString(),
            textLength: reply.text.length,
            textPreview: reply.text.substring(0, 100) + (reply.text.length > 100 ? '...' : ''),
            threadRange: reply.thread.range
                ? {
                    start: {
                        line: reply.thread.range.start.line,
                        char: reply.thread.range.start.character,
                    },
                    end: { line: reply.thread.range.end.line, char: reply.thread.range.end.character },
                }
                : 'undefined',
            existingComments: reply.thread.comments.length,
            hasContextValue: !!reply.thread.contextValue,
        });
        try {
            this.logger.debug('Fetching author information from GitUserService');
            const author = await this.gitUserService.getAuthor();
            this.logger.info('Author retrieved', { name: author.name, email: author.email });
            const commentId = (0, uuid_1.v4)();
            const discussionId = (0, uuid_1.v4)();
            this.logger.debug('Generated IDs', { commentId, discussionId });
            // Create comment model
            const comment = (0, models_1.createComment)(commentId, reply.text, author);
            // Get relative file path
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(reply.thread.uri);
            const filePath = workspaceFolder
                ? vscode.workspace.asRelativePath(reply.thread.uri)
                : reply.thread.uri.fsPath;
            this.logger.debug('Resolved file path', { filePath, hasWorkspaceFolder: !!workspaceFolder });
            // Ensure range is defined
            if (!reply.thread.range) {
                this.logger.error('No range selected for discussion');
                void vscode.window.showErrorMessage('No range selected for discussion');
                return;
            }
            // Convert VS Code Range to LineRange
            const lineRange = {
                start: {
                    line: reply.thread.range.start.line,
                    character: reply.thread.range.start.character,
                },
                end: { line: reply.thread.range.end.line, character: reply.thread.range.end.character },
            };
            this.logger.debug('Discussion range', lineRange);
            // Create discussion model
            const discussion = (0, models_1.createDiscussion)(discussionId, filePath, lineRange, comment, author);
            // Save to storage
            this.logger.debug('Persisting discussion to storage', {
                discussionId,
                filePath,
                commentCount: 1,
                status: discussion.status,
            });
            await this.storageService.createDiscussion(discussion);
            this.logger.info('✓ Discussion persisted to storage', { discussionId, filePath });
            // Update the thread with the new comment
            this.logger.debug('Converting comment to VS Code format');
            const vsComment = this.toVSCodeComment(comment, discussionId);
            this.logger.debug('Updating thread UI', {
                discussionId,
                commentCount: 1,
                state: 'Unresolved',
            });
            reply.thread.comments = [vsComment];
            reply.thread.canReply = true;
            reply.thread.state = vscode.CommentThreadState.Unresolved;
            reply.thread.contextValue = discussionId; // Set contextValue for identification
            this.logger.debug('Thread contextValue set', { contextValue: discussionId });
            // Track the thread
            this.threads.set(discussionId, reply.thread);
            this.logger.info('✓ Thread tracked in memory', {
                discussionId,
                totalThreads: this.threads.size,
            });
            this.logger.info('=== Discussion Created Successfully ===', {
                discussionId,
                filePath,
                author: author.name,
            });
            void vscode.window.showInformationMessage('Discussion created');
            // Notify listeners that discussions changed
            this.onDidChangeDiscussionsEmitter.fire();
        }
        catch (error) {
            this.logger.error('Failed to create discussion', error);
            throw error;
        }
        finally {
            endTimer();
        }
    }
    /**
     * Reply to an existing discussion
     */
    async replyToDiscussion(reply) {
        const endTimer = this.logger.time('replyToDiscussion');
        this.logger.info('=== Reply to Discussion Triggered ===');
        this.logger.debug('CommentController.replyToDiscussion called', {
            uri: reply.thread.uri.toString(),
            existingComments: reply.thread.comments.length,
            textLength: reply.text.length,
            threadContextValue: reply.thread.contextValue ?? 'undefined',
            hasRange: !!reply.thread.range,
        });
        try {
            // Find the discussion ID from the thread
            this.logger.debug('Attempting to locate discussion ID from thread');
            const discussionId = this.findDiscussionIdByThread(reply.thread, true);
            this.logger.debug('Discussion ID lookup result', {
                found: !!discussionId,
                discussionId: discussionId ?? 'null',
                lookupMethod: discussionId ? 'contextValue/map' : 'none',
            });
            // If no discussion ID found, this is a new thread creation
            if (!discussionId) {
                this.logger.info('→ New thread detected, delegating to createDiscussion');
                await this.createDiscussion(reply);
                return;
            }
            this.logger.info('→ Existing discussion found, adding reply', { discussionId });
            this.logger.debug('Fetching author information');
            const author = await this.gitUserService.getAuthor();
            const commentId = (0, uuid_1.v4)();
            this.logger.info('Reply metadata generated', {
                discussionId,
                commentId,
                author: author.name,
                textLength: reply.text.length,
            });
            // Create comment model
            this.logger.debug('Creating comment model');
            const comment = (0, models_1.createComment)(commentId, reply.text, author);
            // Get the discussion
            this.logger.debug('Fetching discussion from storage', { discussionId });
            const discussion = await this.storageService.getDiscussionById(discussionId);
            if (!discussion) {
                this.logger.error('Discussion not found in storage', { discussionId });
                void vscode.window.showErrorMessage('Discussion not found');
                return;
            }
            this.logger.debug('Discussion retrieved from storage', {
                discussionId,
                currentComments: discussion.comments.length,
                filePath: discussion.filePath,
            });
            // Add comment to discussion
            discussion.comments.push(comment);
            discussion.updatedAt = new Date().toISOString();
            this.logger.debug('Comment added to discussion model', {
                newCommentCount: discussion.comments.length,
            });
            // Update storage
            this.logger.debug('Persisting updated discussion to storage');
            await this.storageService.updateDiscussion(discussionId, discussion);
            this.logger.info('✓ Reply persisted to storage', {
                discussionId,
                totalComments: discussion.comments.length,
            });
            // Update thread UI
            this.logger.debug('Updating thread UI with new comment');
            const vsComment = this.toVSCodeComment(comment, discussionId);
            reply.thread.comments = [...reply.thread.comments, vsComment];
            this.logger.info('=== Reply Added Successfully ===', {
                discussionId,
                commentId,
                totalComments: discussion.comments.length,
            });
            // Notify listeners that discussions changed
            this.onDidChangeDiscussionsEmitter.fire();
        }
        catch (error) {
            this.logger.error('Failed to reply to discussion', error);
            throw error;
        }
        finally {
            endTimer();
        }
    }
    /**
     * Resolve a discussion
     */
    async resolveDiscussion(thread) {
        this.logger.info('=== Resolving Discussion ===');
        this.logger.debug('CommentController.resolveDiscussion called', {
            uri: thread.uri.toString(),
            commentsCount: thread.comments.length,
        });
        const discussionId = this.findDiscussionIdByThread(thread);
        if (!discussionId) {
            this.logger.error('Could not find discussion ID for thread');
            void vscode.window.showErrorMessage('Could not find discussion');
            return;
        }
        this.logger.debug('Discussion identified', { discussionId });
        // Update storage
        this.logger.debug('Updating discussion status to Resolved');
        await this.storageService.updateDiscussion(discussionId, {
            status: models_1.DiscussionStatus.Resolved,
            updatedAt: new Date().toISOString(),
        });
        this.logger.info('✓ Discussion status updated in storage', {
            discussionId,
            status: 'Resolved',
        });
        // Update thread UI
        this.logger.debug('Updating thread UI state to Resolved');
        thread.state = vscode.CommentThreadState.Resolved;
        this.logger.info('=== Discussion Resolved Successfully ===', { discussionId });
        void vscode.window.showInformationMessage('Discussion resolved');
        // Notify listeners that discussions changed
        this.onDidChangeDiscussionsEmitter.fire();
    }
    /**
     * Unresolve a discussion
     */
    async unresolveDiscussion(thread) {
        this.logger.trace('CommentController', 'unresolveDiscussion', { uri: thread.uri.toString() });
        const discussionId = this.findDiscussionIdByThread(thread);
        if (!discussionId) {
            this.logger.error('Could not find discussion ID for thread');
            void vscode.window.showErrorMessage('Could not find discussion');
            return;
        }
        // Update storage
        await this.storageService.updateDiscussion(discussionId, {
            status: models_1.DiscussionStatus.Active,
            updatedAt: new Date().toISOString(),
        });
        this.logger.info('Discussion unresolve', { discussionId });
        // Update thread UI
        thread.state = vscode.CommentThreadState.Unresolved;
        void vscode.window.showInformationMessage('Discussion reopened');
        // Notify listeners that discussions changed
        this.onDidChangeDiscussionsEmitter.fire();
    }
    /**
     * Delete a discussion
     */
    async deleteDiscussion(thread) {
        this.logger.trace('CommentController', 'deleteDiscussion', { uri: thread.uri.toString() });
        const discussionId = this.findDiscussionIdByThread(thread);
        if (!discussionId) {
            this.logger.error('Could not find discussion ID for thread');
            void vscode.window.showErrorMessage('Could not find discussion');
            return;
        }
        // Confirm deletion
        const answer = await vscode.window.showWarningMessage('Delete this discussion?', { modal: true }, 'Delete');
        if (answer !== 'Delete') {
            this.logger.debug('Discussion deletion cancelled by user', { discussionId });
            return;
        }
        // Delete from storage
        await this.storageService.deleteDiscussion(discussionId);
        this.logger.info('Discussion deleted', { discussionId });
        // Remove thread from UI
        thread.dispose();
        this.threads.delete(discussionId);
        void vscode.window.showInformationMessage('Discussion deleted');
        // Notify listeners that discussions changed
        this.onDidChangeDiscussionsEmitter.fire();
    }
    /**
     * Create a VS Code comment thread from a discussion model
     */
    createThreadFromDiscussion(discussion) {
        this.logger.debug('→ Creating thread from stored discussion', {
            discussionId: discussion.id,
            filePath: discussion.filePath,
            commentCount: discussion.comments.length,
            status: discussion.status,
        });
        // Get the document URI
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.warn('No workspace folders available for creating thread');
            return;
        }
        this.logger.debug('Workspace folder found', {
            folderPath: workspaceFolders[0].uri.fsPath,
            folderCount: workspaceFolders.length,
        });
        // Build URI from workspace folder and relative path
        const fullPath = path.join(workspaceFolders[0].uri.fsPath, discussion.filePath);
        const uri = vscode.Uri.file(fullPath);
        this.logger.debug('URI constructed for thread', {
            relativePath: discussion.filePath,
            fullPath,
            uri: uri.toString(),
        });
        // Convert LineRange to VS Code Range
        const range = new vscode.Range(discussion.range.start.line, discussion.range.start.character, discussion.range.end.line, discussion.range.end.character);
        // Create the thread
        const vsComments = discussion.comments.map((c) => this.toVSCodeComment(c, discussion.id));
        const thread = this.commentController.createCommentThread(uri, range, vsComments);
        thread.canReply = true;
        thread.contextValue = discussion.id; // Set contextValue for identification
        thread.state =
            discussion.status === models_1.DiscussionStatus.Resolved
                ? vscode.CommentThreadState.Resolved
                : vscode.CommentThreadState.Unresolved;
        // Track the thread
        this.threads.set(discussion.id, thread);
        this.logger.debug('Thread created from discussion', {
            discussionId: discussion.id,
            commentsCount: vsComments.length,
        });
    } /**
     * Convert a discussion comment to VS Code comment
     */
    toVSCodeComment(comment, discussionId) {
        return {
            body: new vscode.MarkdownString(comment.body),
            mode: vscode.CommentMode.Preview,
            author: {
                name: comment.author.name,
            },
            contextValue: discussionId,
            timestamp: new Date(comment.createdAt),
        };
    }
    /**
     * Find discussion ID by comment thread
     */
    findDiscussionIdByThread(thread, suppressWarning = false) {
        this.logger.debug('Finding discussion ID for thread', {
            uri: thread.uri.toString(),
            hasContextValue: !!thread.contextValue,
            commentsCount: thread.comments.length,
        });
        // First, try to get from thread's contextValue (most reliable)
        if (thread.contextValue) {
            this.logger.debug('Found discussion ID from thread contextValue', {
                discussionId: thread.contextValue,
            });
            return thread.contextValue;
        }
        // Second, try to get from first comment's contextValue
        if (thread.comments.length > 0 && thread.comments[0].contextValue) {
            this.logger.debug('Found discussion ID from first comment contextValue', {
                discussionId: thread.comments[0].contextValue,
            });
            return thread.comments[0].contextValue;
        }
        // Finally, try to find by thread reference in our map
        for (const [id, t] of this.threads.entries()) {
            if (t === thread) {
                this.logger.debug('Found discussion ID from thread map', { discussionId: id });
                return id;
            }
        }
        // Log warning only if not suppressed (e.g., for new thread creation this is expected)
        if (!suppressWarning) {
            this.logger.warn('Could not find discussion ID for thread', {
                uri: thread.uri.toString(),
                threadContextValue: thread.contextValue,
                commentsCount: thread.comments.length,
            });
        }
        else {
            this.logger.debug('Could not find discussion ID for thread (expected for new thread)', {
                uri: thread.uri.toString(),
            });
        }
        return undefined;
    }
    /**
     * Refresh comment threads for a document
     */
    async refreshThreadsForDocument(_document) {
        // This would reload threads if needed
        // For now, threads persist across editor changes
    }
    /**
     * Refresh all comment threads from storage
     */
    async refreshAllThreads() {
        this.logger.trace('CommentController', 'refreshAllThreads');
        // Clear existing threads
        for (const thread of this.threads.values()) {
            thread.dispose();
        }
        this.threads.clear();
        this.logger.debug('Cleared existing threads');
        // Reload discussions from storage
        const discussions = await this.storageService.getDiscussions();
        this.logger.info('Reloading discussions', { count: discussions.length });
        // Recreate threads
        for (const discussion of discussions) {
            this.createThreadFromDiscussion(discussion);
        }
        this.logger.info('All threads refreshed', { totalThreads: this.threads.size });
    }
    /**
     * Dispose of resources
     */
    dispose() {
        this.logger.info('Disposing CommentController', { threadCount: this.threads.size });
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.threads.clear();
        this.logger.debug('CommentController disposed');
    }
}
exports.CommentController = CommentController;
//# sourceMappingURL=comment.controller.js.map