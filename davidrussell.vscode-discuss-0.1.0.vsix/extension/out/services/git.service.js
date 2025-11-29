"use strict";
/**
 * Service for Git repository operations
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
exports.GitService = void 0;
const vscode = __importStar(require("vscode"));
const utils_1 = require("../utils");
/**
 * Service for interacting with Git
 */
class GitService {
    gitAPI = null;
    logger = (0, utils_1.getLogger)();
    /**
     * Initialize the Git service
     */
    async initialize() {
        this.logger.trace('GitService', 'initialize');
        try {
            // Get the Git extension
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                this.logger.warn('Git extension not found');
                return;
            }
            // Activate the extension if needed
            if (!gitExtension.isActive) {
                this.logger.debug('Activating Git extension');
                await gitExtension.activate();
            }
            // Get the Git API
            this.gitAPI = gitExtension.exports.getAPI(1);
            this.logger.info('GitService initialized successfully', {
                repositories: this.gitAPI.repositories.length,
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize GitService', error);
        }
    }
    /**
     * Get the Git repository for a workspace folder
     */
    getRepository(workspaceUri) {
        if (!this.gitAPI) {
            this.logger.warn('Git API not available');
            return null;
        }
        const repository = this.gitAPI.getRepository(workspaceUri);
        if (!repository) {
            this.logger.debug('No Git repository found', { uri: workspaceUri.toString() });
            return null;
        }
        this.logger.debug('Found Git repository', {
            rootUri: repository.rootUri.fsPath,
            branch: repository.state.HEAD?.name,
        });
        return repository;
    }
    /**
     * Get the first available Git repository
     */
    getPrimaryRepository() {
        if (!this.gitAPI) {
            this.logger.warn('Git API not available');
            return null;
        }
        const repositories = this.gitAPI.repositories;
        if (repositories.length === 0) {
            this.logger.debug('No Git repositories found');
            return null;
        }
        const repository = repositories[0];
        this.logger.debug('Found primary Git repository', {
            rootUri: repository.rootUri.fsPath,
            branch: repository.state.HEAD?.name,
        });
        return repository;
    }
    /**
     * Get the root URI of the primary Git repository
     */
    getPrimaryRepositoryRoot() {
        const repository = this.getPrimaryRepository();
        return repository?.rootUri ?? null;
    }
    /**
     * Wait for Git repositories to be discovered
     * The Git extension discovers repositories asynchronously after activation
     */
    async waitForRepositories(timeoutMs = 5000) {
        this.logger.debug('Waiting for Git repositories to be discovered', { timeoutMs });
        if (!this.gitAPI) {
            this.logger.warn('Git API not available');
            return null;
        }
        // Check if we already have repositories
        if (this.gitAPI.repositories.length > 0) {
            this.logger.debug('Git repositories already available', {
                count: this.gitAPI.repositories.length,
            });
            return this.gitAPI.repositories[0];
        }
        // Wait for repositories to be discovered
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = 100; // Check every 100ms
            const intervalId = setInterval(() => {
                if (this.gitAPI && this.gitAPI.repositories.length > 0) {
                    this.logger.info('Git repository discovered', {
                        rootUri: this.gitAPI.repositories[0].rootUri.fsPath,
                        elapsedMs: Date.now() - startTime,
                    });
                    clearInterval(intervalId);
                    resolve(this.gitAPI.repositories[0]);
                }
                else if (Date.now() - startTime >= timeoutMs) {
                    this.logger.warn('Timeout waiting for Git repositories', {
                        elapsedMs: Date.now() - startTime,
                    });
                    clearInterval(intervalId);
                    resolve(null);
                }
            }, checkInterval);
        });
    }
    /**
     * Check if a workspace folder is a Git repository
     */
    isGitRepository(workspaceUri) {
        return this.getRepository(workspaceUri) !== null;
    }
    /**
     * Get the current branch name
     */
    getCurrentBranch(workspaceUri) {
        const repository = this.getRepository(workspaceUri);
        return repository?.state.HEAD?.name;
    }
    /**
     * Get the current commit hash
     */
    getCurrentCommit(workspaceUri) {
        const repository = this.getRepository(workspaceUri);
        return repository?.state.HEAD?.commit;
    }
    /**
     * Stage a file for commit
     */
    async stageFile(workspaceUri, filePath) {
        this.logger.trace('GitService', 'stageFile', { filePath });
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            throw new Error('No Git repository found');
        }
        try {
            // Stage the file using Git repository API
            await repository.add([filePath]);
            this.logger.info('File staged for commit', { filePath });
        }
        catch (error) {
            this.logger.error('Failed to stage file', error);
            throw error;
        }
    }
    /**
     * Commit staged changes
     */
    async commit(workspaceUri, message) {
        this.logger.trace('GitService', 'commit', { message });
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            throw new Error('No Git repository found');
        }
        try {
            // Commit using Git repository API
            await repository.commit(message);
            this.logger.info('Changes committed', { message });
        }
        catch (error) {
            this.logger.error('Failed to commit changes', error);
            throw error;
        }
    }
    /**
     * Stage and commit a file in one operation
     */
    async stageAndCommit(workspaceUri, filePath, message) {
        this.logger.info('=== GitService.stageAndCommit ===');
        this.logger.debug('Staging and committing file', { filePath, message });
        this.logger.trace('GitService', 'stageAndCommit', { filePath, message });
        this.logger.debug('Step 1: Staging file');
        await this.stageFile(workspaceUri, filePath);
        this.logger.debug('✓ File staged');
        this.logger.debug('Step 2: Committing changes');
        await this.commit(workspaceUri, message);
        this.logger.info('✓ File staged and committed', { filePath, message });
    }
    /**
     * Check if there are uncommitted changes to a file
     */
    hasUncommittedChanges(workspaceUri, filePath) {
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            return false;
        }
        try {
            // Get repository status
            const status = repository.state;
            const changes = [
                ...(status.workingTreeChanges || []),
                ...(status.indexChanges || []),
                ...(status.mergeChanges || []),
            ];
            // Check if our file has changes
            return changes.some((change) => change.uri.fsPath.endsWith(filePath));
        }
        catch (error) {
            this.logger.error('Failed to check uncommitted changes', error);
            return false;
        }
    }
    /**
     * Check if Git is available
     */
    isAvailable() {
        return this.gitAPI !== null;
    }
    /**
     * Check if a file has merge conflicts
     */
    hasConflicts(workspaceUri, filePath) {
        this.logger.debug('=== GitService.hasConflicts ===');
        this.logger.debug('Checking for merge conflicts', {
            workspace: workspaceUri.fsPath,
            file: filePath,
        });
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            this.logger.debug('No repository found, no conflicts');
            return false;
        }
        try {
            // Check if file is in merge changes (conflict state)
            const mergeChanges = repository.state.mergeChanges || [];
            this.logger.debug('Merge state', {
                mergeChangesCount: mergeChanges.length,
                files: mergeChanges.map((c) => c.uri.fsPath),
            });
            const hasConflict = mergeChanges.some((change) => change.uri.fsPath.includes(filePath));
            this.logger.debug('Conflict check result', { filePath, hasConflict });
            return hasConflict;
        }
        catch (error) {
            this.logger.error('Failed to check for conflicts', error);
            return false;
        }
    }
    /**
     * Get all files with merge conflicts
     */
    getConflictedFiles(workspaceUri) {
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            return [];
        }
        try {
            const mergeChanges = repository.state.mergeChanges || [];
            return mergeChanges.map((change) => change.uri);
        }
        catch (error) {
            this.logger.error('Failed to get conflicted files', error);
            return [];
        }
    }
    /**
     * Check if repository is in a merge state
     */
    isInMergeState(workspaceUri) {
        const repository = this.getRepository(workspaceUri);
        if (!repository) {
            return false;
        }
        try {
            const mergeChanges = repository.state.mergeChanges || [];
            return mergeChanges.length > 0;
        }
        catch (error) {
            this.logger.error('Failed to check merge state', error);
            return false;
        }
    }
}
exports.GitService = GitService;
//# sourceMappingURL=git.service.js.map