"use strict";
/**
 * GitService - Handles Git operations on the sidecar discussions repository
 *
 * Uses VS Code's built-in Git extension API for robustness.
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
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class GitService {
    discussionRepoPath = null;
    codeRepoPath = null;
    syncInterval = null;
    _onDidSync = new vscode.EventEmitter();
    /**
     * Event fired when sync (pull) completes and there may be new data
     */
    onDidSync = this._onDidSync.event;
    /**
     * Initialize with repo paths
     */
    initialize(codeRepoPath, discussionRepoPath) {
        this.codeRepoPath = codeRepoPath;
        this.discussionRepoPath = discussionRepoPath;
    }
    /**
     * Check if initialized
     */
    get isInitialized() {
        return this.discussionRepoPath !== null && this.codeRepoPath !== null;
    }
    /**
     * Get the current Git user info
     */
    async getCurrentUser() {
        try {
            const [nameResult, emailResult] = await Promise.all([
                execAsync('git config user.name', { cwd: this.codeRepoPath || undefined }),
                execAsync('git config user.email', { cwd: this.codeRepoPath || undefined }),
            ]);
            return {
                name: nameResult.stdout.trim() || 'Unknown',
                email: emailResult.stdout.trim() || '',
            };
        }
        catch {
            // Fallback to OS username
            return {
                name: process.env.USER || process.env.USERNAME || 'Unknown',
                email: '',
            };
        }
    }
    /**
     * Get the current HEAD commit SHA of the code repo
     * Returns empty string if repo has no commits yet
     */
    async getCodeRepoHeadSha() {
        if (!this.codeRepoPath) {
            throw new Error('Code repo path not set');
        }
        try {
            const result = await execAsync('git rev-parse HEAD', { cwd: this.codeRepoPath });
            return result.stdout.trim();
        }
        catch (error) {
            // Handle case where repo has no commits yet
            const errorMessage = String(error);
            if (errorMessage.includes('ambiguous argument') || errorMessage.includes('unknown revision')) {
                return ''; // No commits yet
            }
            throw new Error(`Failed to get HEAD SHA: ${error}`);
        }
    }
    /**
     * Get the remote origin URL of the code repo
     */
    async getCodeRepoRemoteUrl() {
        if (!this.codeRepoPath) {
            return undefined;
        }
        try {
            const result = await execAsync('git remote get-url origin', { cwd: this.codeRepoPath });
            return result.stdout.trim();
        }
        catch {
            return undefined;
        }
    }
    /**
     * Get the remote origin URL of the discussions repo
     */
    async getDiscussionRepoRemoteUrl() {
        if (!this.discussionRepoPath) {
            return undefined;
        }
        try {
            const result = await execAsync('git remote get-url origin', { cwd: this.discussionRepoPath });
            return result.stdout.trim();
        }
        catch {
            return undefined;
        }
    }
    /**
     * Check if the discussions repo has a remote configured
     */
    async hasRemote() {
        const remoteUrl = await this.getDiscussionRepoRemoteUrl();
        return !!remoteUrl;
    }
    /**
     * Check if the code repo has uncommitted changes
     */
    async hasUncommittedChanges() {
        if (!this.codeRepoPath) {
            return false;
        }
        try {
            const result = await execAsync('git status --porcelain', { cwd: this.codeRepoPath });
            return result.stdout.trim().length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Stage a file in the discussions repo
     */
    async stageFile(relativePath) {
        if (!this.discussionRepoPath) {
            throw new Error('Discussion repo path not set');
        }
        try {
            await execAsync(`git add "${relativePath}"`, { cwd: this.discussionRepoPath });
        }
        catch (error) {
            throw new Error(`Failed to stage file: ${error}`);
        }
    }
    /**
     * Commit changes in the discussions repo
     */
    async commit(message) {
        if (!this.discussionRepoPath) {
            throw new Error('Discussion repo path not set');
        }
        try {
            // First check if there are staged changes
            const status = await execAsync('git diff --cached --name-only', { cwd: this.discussionRepoPath });
            if (!status.stdout.trim()) {
                // Nothing staged, nothing to commit
                return;
            }
            await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
                cwd: this.discussionRepoPath
            });
        }
        catch (error) {
            // Handle first commit case or other errors
            const errorMessage = String(error);
            if (errorMessage.includes('nothing to commit')) {
                return; // Nothing to commit is fine
            }
            throw new Error(`Failed to commit: ${error}`);
        }
    }
    /**
     * Stage and commit a discussion file, then push if configured
     */
    async commitDiscussion(discussionId, action, details) {
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoCommit = config.get('autoCommitDiscussionRepo', true);
        if (!autoCommit) {
            return;
        }
        const relativePath = path.join('discussions', `${discussionId}.yml`);
        await this.stageFile(relativePath);
        const message = details
            ? `${action} discussion ${discussionId}: ${details}`
            : `${action} discussion ${discussionId}`;
        await this.commit(message);
        // Push after commit if remote exists
        await this.push();
    }
    /**
     * Push changes to the remote discussions repo
     */
    async push() {
        if (!this.discussionRepoPath) {
            return false;
        }
        // Check if remote exists
        if (!await this.hasRemote()) {
            return false;
        }
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoPush = config.get('autoPush', true);
        if (!autoPush) {
            return false;
        }
        try {
            await execAsync('git push', { cwd: this.discussionRepoPath });
            return true;
        }
        catch (error) {
            const errorMessage = String(error);
            // Handle case where there's nothing to push or upstream not set
            if (errorMessage.includes('no upstream') || errorMessage.includes('Everything up-to-date')) {
                return true;
            }
            console.warn('Failed to push discussions:', error);
            // Don't throw - pushing is best-effort
            vscode.window.showWarningMessage(`Failed to push discussions: ${errorMessage.substring(0, 200)}`);
            return false;
        }
    }
    /**
     * Fetch changes from the remote discussions repo
     */
    async fetch() {
        if (!this.discussionRepoPath) {
            return false;
        }
        if (!await this.hasRemote()) {
            return false;
        }
        try {
            await execAsync('git fetch', { cwd: this.discussionRepoPath });
            return true;
        }
        catch (error) {
            console.warn('Failed to fetch discussions:', error);
            return false;
        }
    }
    /**
     * Pull changes from the remote discussions repo
     */
    async pull() {
        if (!this.discussionRepoPath) {
            return false;
        }
        if (!await this.hasRemote()) {
            return false;
        }
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoFetch = config.get('autoFetch', true);
        if (!autoFetch) {
            return false;
        }
        try {
            // Check if we have any local changes that could cause conflicts
            const status = await execAsync('git status --porcelain', { cwd: this.discussionRepoPath });
            if (status.stdout.trim()) {
                // Have uncommitted changes, skip pull to avoid conflicts
                console.log('Skipping pull - uncommitted changes in discussions repo');
                return false;
            }
            await execAsync('git pull --ff-only', { cwd: this.discussionRepoPath });
            this._onDidSync.fire();
            return true;
        }
        catch (error) {
            const errorMessage = String(error);
            // Handle case where there's nothing to pull or merge conflicts
            if (errorMessage.includes('Already up to date')) {
                return true;
            }
            if (errorMessage.includes('CONFLICT') || errorMessage.includes('not possible to fast-forward')) {
                vscode.window.showWarningMessage('Merge conflict detected in discussions repo. Please resolve manually.', 'Open Discussions Repo').then(choice => {
                    if (choice === 'Open Discussions Repo' && this.discussionRepoPath) {
                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(this.discussionRepoPath), true);
                    }
                });
                return false;
            }
            console.warn('Failed to pull discussions:', error);
            return false;
        }
    }
    /**
     * Check if there are incoming changes (remote is ahead)
     */
    async hasIncomingChanges() {
        if (!this.discussionRepoPath || !await this.hasRemote()) {
            return false;
        }
        try {
            await this.fetch();
            const result = await execAsync('git rev-list HEAD..@{u} --count', { cwd: this.discussionRepoPath });
            return parseInt(result.stdout.trim(), 10) > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if there are outgoing changes (local is ahead)
     */
    async hasOutgoingChanges() {
        if (!this.discussionRepoPath || !await this.hasRemote()) {
            return false;
        }
        try {
            const result = await execAsync('git rev-list @{u}..HEAD --count', { cwd: this.discussionRepoPath });
            return parseInt(result.stdout.trim(), 10) > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Start periodic sync (fetch + pull) for the discussions repo
     */
    startPeriodicSync() {
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const syncIntervalMinutes = config.get('syncIntervalMinutes', 5);
        if (syncIntervalMinutes <= 0) {
            return; // Disabled
        }
        // Clear existing interval if any
        this.stopPeriodicSync();
        // Initial sync after a short delay
        setTimeout(() => {
            this.pull().catch(err => console.warn('Initial pull failed:', err));
        }, 5000);
        // Set up periodic sync
        this.syncInterval = setInterval(async () => {
            try {
                const pulled = await this.pull();
                if (pulled) {
                    console.log('Discussions synced from remote');
                }
            }
            catch (err) {
                console.warn('Periodic sync failed:', err);
            }
        }, syncIntervalMinutes * 60 * 1000);
    }
    /**
     * Stop periodic sync
     */
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    /**
     * Manually sync with remote (pull then push)
     */
    async sync() {
        await this.pull();
        await this.push();
    }
    dispose() {
        this.stopPeriodicSync();
        this._onDidSync.dispose();
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map