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
exports.StorageService = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const models_1 = require("../models");
const utils_1 = require("../utils");
/**
 * Service for managing discussion storage in the workspace
 */
class StorageService {
    static STORAGE_FOLDER = '.vscode-discuss';
    static STORAGE_FILE = 'discussions.json';
    cache = null;
    fileWatcher = null;
    workspaceRoot;
    storagePath;
    logger = (0, utils_1.getLogger)();
    gitService = null;
    constructor(workspaceRoot, gitService) {
        this.workspaceRoot = workspaceRoot;
        this.storagePath = vscode.Uri.file(path.join(workspaceRoot, StorageService.STORAGE_FOLDER, StorageService.STORAGE_FILE));
        this.gitService = gitService ?? null;
        this.logger.debug('StorageService created', {
            workspaceRoot,
            storagePath: this.storagePath.fsPath,
            gitEnabled: !!this.gitService,
        });
    }
    /**
     * Initialize the storage service
     */
    async initialize() {
        this.logger.trace('StorageService', 'initialize');
        await this.ensureStorageDirectoryExists();
        await this.loadDiscussions();
        this.setupFileWatcher();
        this.logger.info('StorageService initialized', { storagePath: this.storagePath.fsPath });
    }
    /**
     * Dispose of resources
     */
    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
    }
    /**
     * Get all discussions
     */
    async getDiscussions() {
        if (!this.cache) {
            await this.loadDiscussions();
        }
        return this.cache?.discussions ?? [];
    }
    /**
     * Get discussions for a specific file
     */
    async getDiscussionsByFile(filePath) {
        const discussions = await this.getDiscussions();
        return discussions.filter((d) => d.filePath === filePath);
    }
    /**
     * Get a discussion by ID
     */
    async getDiscussionById(id) {
        const discussions = await this.getDiscussions();
        return discussions.find((d) => d.id === id);
    }
    /**
     * Create a new discussion
     */
    async createDiscussion(discussion) {
        this.logger.info('=== StorageService.createDiscussion ===');
        this.logger.debug('Creating discussion', {
            discussionId: discussion.id,
            filePath: discussion.filePath,
            author: discussion.comments[0]?.author.name,
            commentCount: discussion.comments.length,
            status: discussion.status,
            range: {
                start: discussion.range.start.line,
                end: discussion.range.end.line,
            },
        });
        const discussions = await this.getDiscussions();
        this.logger.debug('Current discussions count before add', { count: discussions.length });
        discussions.push(discussion);
        this.logger.debug('Discussion added to array, saving to disk');
        await this.saveDiscussions(discussions);
        this.logger.debug('Checking if Git auto-commit is enabled');
        await this.commitToGit('created');
        this.logger.info('✓ Discussion created successfully', {
            discussionId: discussion.id,
            totalDiscussions: discussions.length,
        });
    }
    /**
     * Update an existing discussion
     */
    async updateDiscussion(id, updates) {
        this.logger.info('=== StorageService.updateDiscussion ===');
        this.logger.debug('Updating discussion', {
            discussionId: id,
            updateKeys: Object.keys(updates),
            hasStatusChange: 'status' in updates,
            hasCommentChange: 'comments' in updates,
        });
        const discussions = await this.getDiscussions();
        const index = discussions.findIndex((d) => d.id === id);
        if (index === -1) {
            this.logger.error('Discussion not found for update', { discussionId: id });
            throw new Error(`Discussion with id ${id} not found`);
        }
        this.logger.debug('Discussion found at index', {
            index,
            filePath: discussions[index].filePath,
        });
        const oldCommentCount = discussions[index].comments.length;
        discussions[index] = {
            ...discussions[index],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        const newCommentCount = discussions[index].comments.length;
        this.logger.debug('Discussion updated in memory', {
            oldCommentCount,
            newCommentCount,
            commentAdded: newCommentCount > oldCommentCount,
        });
        await this.saveDiscussions(discussions);
        await this.commitToGit('updated');
        this.logger.info('✓ Discussion updated successfully', { discussionId: id });
    }
    /**
     * Add a reply to an existing discussion
     */
    async addReply(discussionId, replyBody, author, parentId) {
        this.logger.info('=== StorageService.addReply ===');
        this.logger.debug('Adding reply to discussion', {
            discussionId,
            author: author.name,
            bodyLength: replyBody.length,
            parentId: parentId || 'top-level',
        });
        const discussion = await this.getDiscussionById(discussionId);
        if (!discussion) {
            this.logger.error('Discussion not found for reply', { discussionId });
            throw new Error(`Discussion with id ${discussionId} not found`);
        }
        // Validate parent comment exists if parentId provided
        if (parentId) {
            const parentExists = discussion.comments.some((c) => c.id === parentId);
            if (!parentExists) {
                this.logger.error('Parent comment not found', { parentId });
                throw new Error(`Parent comment with id ${parentId} not found`);
            }
        }
        // Create new comment
        const { v4: uuidv4 } = await Promise.resolve().then(() => __importStar(require('uuid')));
        const now = new Date().toISOString();
        const newComment = {
            id: uuidv4(),
            body: replyBody,
            author,
            createdAt: now,
            updatedAt: now,
            parentId,
        };
        // Add to comments array
        const updatedComments = [...discussion.comments, newComment];
        this.logger.debug('Reply created', {
            commentId: newComment.id,
            totalComments: updatedComments.length,
        });
        await this.updateDiscussion(discussionId, {
            comments: updatedComments,
        });
        this.logger.info('✓ Reply added successfully', { discussionId });
    }
    /**
     * Delete a discussion
     */
    async deleteDiscussion(id) {
        this.logger.debug('Deleting discussion', { discussionId: id });
        const discussions = await this.getDiscussions();
        const filtered = discussions.filter((d) => d.id !== id);
        if (filtered.length === discussions.length) {
            this.logger.error('Discussion not found for deletion', { discussionId: id });
            throw new Error(`Discussion with id ${id} not found`);
        }
        await this.saveDiscussions(filtered);
        await this.commitToGit('deleted');
        this.logger.info('Discussion deleted', {
            discussionId: id,
            remainingDiscussions: filtered.length,
        });
    }
    /**
     * Load discussions from file
     */
    async loadDiscussions() {
        const endTimer = this.logger.time('loadDiscussions');
        this.logger.debug('=== Loading Discussions from Storage ===');
        this.logger.debug('Storage path', { path: this.storagePath.fsPath });
        try {
            const fileExists = await this.fileExists(this.storagePath);
            this.logger.debug('Storage file existence check', { exists: fileExists });
            if (!fileExists) {
                this.logger.info('Storage file does not exist, creating empty storage');
                this.cache = (0, models_1.createEmptyStorage)();
                return;
            }
            // Check for merge conflicts before loading
            if (this.gitService) {
                this.logger.debug('Checking for Git merge conflicts');
                const workspaceUri = vscode.Uri.file(this.workspaceRoot);
                const relativePath = path.relative(this.workspaceRoot, this.storagePath.fsPath);
                if (this.gitService.hasConflicts(workspaceUri, relativePath)) {
                    this.logger.error('Merge conflicts detected in storage file');
                    await this.handleMergeConflict();
                    return;
                }
                this.logger.debug('No merge conflicts detected');
            }
            else {
                this.logger.debug('Git service not available, skipping conflict check');
            }
            this.logger.debug('Reading storage file from disk');
            const content = await vscode.workspace.fs.readFile(this.storagePath);
            const text = Buffer.from(content).toString('utf8');
            this.logger.debug('Storage file read complete', {
                sizeBytes: content.length,
                sizeKB: (content.length / 1024).toFixed(2),
            });
            this.logger.debug('Parsing JSON content');
            const storage = JSON.parse(text);
            // Validate storage version
            this.logger.debug('Validating storage version', {
                found: storage.version,
                expected: models_1.STORAGE_VERSION,
            });
            if (!(0, models_1.isValidStorageVersion)(storage.version)) {
                this.logger.error('Invalid storage version', {
                    foundVersion: storage.version,
                    expectedVersion: models_1.STORAGE_VERSION,
                });
                throw new Error(`Unsupported storage version: ${storage.version}. Expected: ${models_1.STORAGE_VERSION}`);
            }
            this.cache = storage;
            this.logger.info('✓ Discussions loaded successfully', {
                discussionCount: storage.discussions.length,
                version: storage.version,
                discussions: storage.discussions.map((d) => ({
                    id: d.id.substring(0, 8) + '...',
                    file: d.filePath,
                    comments: d.comments.length,
                    status: d.status,
                })),
            });
        }
        catch (error) {
            this.logger.error('Error loading discussions', error);
            // On error, initialize with empty storage
            this.cache = (0, models_1.createEmptyStorage)();
            throw error;
        }
        finally {
            endTimer();
        }
    }
    /**
     * Save discussions to file
     */
    async saveDiscussions(discussions) {
        const endTimer = this.logger.time('saveDiscussions');
        this.logger.debug('Saving discussions to file', { count: discussions.length });
        try {
            await this.ensureStorageDirectoryExists();
            const storage = this.cache ? (0, models_1.updateStorage)(this.cache, discussions) : (0, models_1.createEmptyStorage)();
            storage.discussions = discussions;
            const content = JSON.stringify(storage, null, 2);
            const buffer = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(this.storagePath, buffer);
            this.cache = storage;
            this.logger.info('Discussions saved successfully', {
                discussionCount: discussions.length,
                fileSize: buffer.length,
            });
        }
        catch (error) {
            this.logger.error('Error saving discussions', error);
            throw error;
        }
        finally {
            endTimer();
        }
    }
    /**
     * Ensure storage directory exists
     */
    async ensureStorageDirectoryExists() {
        const dirPath = vscode.Uri.file(path.join(this.workspaceRoot, StorageService.STORAGE_FOLDER));
        try {
            await vscode.workspace.fs.stat(dirPath);
        }
        catch {
            // Directory doesn't exist, create it
            await vscode.workspace.fs.createDirectory(dirPath);
            // Create .gitignore to prevent tracking temporary files
            const gitignorePath = vscode.Uri.file(path.join(dirPath.fsPath, '.gitignore'));
            const gitignoreContent = '# Temporary files\n*.tmp\n';
            await vscode.workspace.fs.writeFile(gitignorePath, Buffer.from(gitignoreContent, 'utf8'));
        }
    }
    /**
     * Check if file exists
     */
    async fileExists(uri) {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Setup file watcher for external changes
     */
    setupFileWatcher() {
        this.logger.debug('Setting up file watcher for storage file');
        const pattern = new vscode.RelativePattern(this.workspaceRoot, `${StorageService.STORAGE_FOLDER}/${StorageService.STORAGE_FILE}`);
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.fileWatcher.onDidChange(async () => {
            this.logger.info('Storage file changed externally, reloading');
            // Reload discussions when file changes externally (e.g., git pull)
            await this.loadDiscussions();
        });
        this.fileWatcher.onDidDelete(() => {
            this.logger.warn('Storage file deleted externally, resetting cache');
            // If file is deleted, reset cache
            this.cache = (0, models_1.createEmptyStorage)();
        });
        this.logger.debug('File watcher setup complete');
    }
    /**
     * Get storage file path
     */
    getStoragePath() {
        return this.storagePath.fsPath;
    }
    /**
     * Invalidate cache and reload from disk
     */
    async reload() {
        this.logger.info('Reloading discussions from disk');
        this.cache = null;
        await this.loadDiscussions();
    }
    /**
     * Commit discussion changes to Git if auto-commit is enabled
     */
    async commitToGit(action) {
        // Check if Git auto-commit is enabled
        const config = vscode.workspace.getConfiguration('vscodeDiscuss');
        const autoCommit = config.get('git.autoCommit', false);
        if (!autoCommit || !this.gitService) {
            this.logger.debug('Git auto-commit disabled or Git service not available');
            return;
        }
        try {
            const workspaceUri = vscode.Uri.file(this.workspaceRoot);
            // Check if workspace is a Git repository
            if (!this.gitService.isGitRepository(workspaceUri)) {
                this.logger.debug('Workspace is not a Git repository');
                return;
            }
            // Get commit message template
            const messageTemplate = config.get('git.commitMessageTemplate', 'Update discussions: {action}');
            const commitMessage = messageTemplate.replace('{action}', action);
            // Get relative path for Git operations
            const relativePath = path.relative(this.workspaceRoot, this.storagePath.fsPath);
            // Stage and commit the discussion file
            await this.gitService.stageAndCommit(workspaceUri, relativePath, commitMessage);
            this.logger.info('Discussion changes committed to Git', { action, message: commitMessage });
        }
        catch (error) {
            // Don't fail the operation if Git commit fails
            this.logger.warn('Failed to commit to Git (non-fatal)', error);
        }
    }
    /**
     * Handle merge conflicts in the discussions file
     */
    async handleMergeConflict() {
        this.logger.warn('Merge conflict detected in discussions file');
        const choice = await vscode.window.showErrorMessage('Merge conflict detected in discussions file (.vscode-discuss/discussions.json). ' +
            'Please resolve the conflict manually or choose an option.', 'Open File', 'Use Local Version', 'Cancel');
        if (choice === 'Open File') {
            // Open the file in the editor so user can resolve conflicts
            await vscode.window.showTextDocument(this.storagePath);
            this.cache = (0, models_1.createEmptyStorage)();
        }
        else if (choice === 'Use Local Version') {
            // Use the current local version (accept theirs/ours depending on merge direction)
            try {
                const content = await vscode.workspace.fs.readFile(this.storagePath);
                const text = Buffer.from(content).toString('utf8');
                // Try to parse despite conflicts - this will fail with conflict markers
                // User will need to manually resolve
                this.logger.info('Attempting to use local version');
                const storage = JSON.parse(text);
                this.cache = storage;
                void vscode.window.showInformationMessage('Using local version. Please verify discussions are correct.');
            }
            catch (error) {
                this.logger.error('Failed to parse local version', error);
                void vscode.window.showErrorMessage('Failed to use local version. Please resolve conflicts manually.');
                this.cache = (0, models_1.createEmptyStorage)();
            }
        }
        else {
            // User cancelled - use empty storage
            this.cache = (0, models_1.createEmptyStorage)();
        }
    }
}
exports.StorageService = StorageService;
//# sourceMappingURL=storage.service.js.map