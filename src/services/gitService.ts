/**
 * GitService - Handles Git operations on the sidecar discussions repository
 * 
 * Uses VS Code's built-in Git extension API for robustness.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitUserInfo {
    name: string;
    email: string;
}

export class GitService {
    private discussionRepoPath: string | null = null;
    private codeRepoPath: string | null = null;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private _onDidSync = new vscode.EventEmitter<void>();
    
    /**
     * Event fired when sync (pull) completes and there may be new data
     */
    readonly onDidSync = this._onDidSync.event;

    /**
     * Initialize with repo paths
     */
    initialize(codeRepoPath: string, discussionRepoPath: string): void {
        this.codeRepoPath = codeRepoPath;
        this.discussionRepoPath = discussionRepoPath;
    }

    /**
     * Check if initialized
     */
    get isInitialized(): boolean {
        return this.discussionRepoPath !== null && this.codeRepoPath !== null;
    }

    /**
     * Get the current Git user info
     */
    async getCurrentUser(): Promise<GitUserInfo> {
        try {
            const [nameResult, emailResult] = await Promise.all([
                execAsync('git config user.name', { cwd: this.codeRepoPath || undefined }),
                execAsync('git config user.email', { cwd: this.codeRepoPath || undefined }),
            ]);

            return {
                name: nameResult.stdout.trim() || 'Unknown',
                email: emailResult.stdout.trim() || '',
            };
        } catch {
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
    async getCodeRepoHeadSha(): Promise<string> {
        if (!this.codeRepoPath) {
            throw new Error('Code repo path not set');
        }

        try {
            const result = await execAsync('git rev-parse HEAD', { cwd: this.codeRepoPath });
            return result.stdout.trim();
        } catch (error) {
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
    async getCodeRepoRemoteUrl(): Promise<string | undefined> {
        if (!this.codeRepoPath) {
            return undefined;
        }

        try {
            const result = await execAsync('git remote get-url origin', { cwd: this.codeRepoPath });
            return result.stdout.trim();
        } catch {
            return undefined;
        }
    }

    /**
     * Get the remote origin URL of the discussions repo
     */
    async getDiscussionRepoRemoteUrl(): Promise<string | undefined> {
        if (!this.discussionRepoPath) {
            return undefined;
        }

        try {
            const result = await execAsync('git remote get-url origin', { cwd: this.discussionRepoPath });
            return result.stdout.trim();
        } catch {
            return undefined;
        }
    }

    /**
     * Check if the discussions repo has a remote configured
     */
    async hasRemote(): Promise<boolean> {
        const remoteUrl = await this.getDiscussionRepoRemoteUrl();
        return !!remoteUrl;
    }

    /**
     * Check if the code repo has uncommitted changes
     */
    async hasUncommittedChanges(): Promise<boolean> {
        if (!this.codeRepoPath) {
            return false;
        }

        try {
            const result = await execAsync('git status --porcelain', { cwd: this.codeRepoPath });
            return result.stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Stage a file in the discussions repo
     */
    async stageFile(relativePath: string): Promise<void> {
        if (!this.discussionRepoPath) {
            throw new Error('Discussion repo path not set');
        }

        try {
            await execAsync(`git add "${relativePath}"`, { cwd: this.discussionRepoPath });
        } catch (error) {
            throw new Error(`Failed to stage file: ${error}`);
        }
    }

    /**
     * Commit changes in the discussions repo
     */
    async commit(message: string): Promise<void> {
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
        } catch (error) {
            // Handle first commit case or other errors
            const errorMessage = String(error);
            if (errorMessage.includes('nothing to commit')) {
                return; // Nothing to commit is fine
            }
            throw new Error(`Failed to commit: ${error}`);
        }
    }

    /**
     * Stage and commit a discussion folder (for new discussions), then push if configured
     */
    async commitDiscussion(discussionId: string, action: string, details?: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoCommit = config.get<boolean>('autoCommitDiscussionRepo', true);
        
        if (!autoCommit) {
            return;
        }

        // Stage the entire discussion folder
        const relativePath = path.join('discussions', discussionId);
        await this.stageFile(relativePath);
        
        const message = details 
            ? `${action} discussion ${discussionId}: ${details}`
            : `${action} discussion ${discussionId}`;
        
        await this.commit(message);
        
        // Push after commit if remote exists
        await this.push();
    }

    /**
     * Stage and commit a specific file (for adding comments or updating meta), then push
     */
    async commitFile(relativePath: string, message: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoCommit = config.get<boolean>('autoCommitDiscussionRepo', true);
        
        if (!autoCommit) {
            return;
        }

        await this.stageFile(relativePath);
        await this.commit(message);
        await this.push();
    }

    /**
     * Push changes to the remote discussions repo
     */
    async push(): Promise<boolean> {
        if (!this.discussionRepoPath) {
            return false;
        }

        // Check if remote exists
        if (!await this.hasRemote()) {
            return false;
        }

        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoPush = config.get<boolean>('autoPush', true);
        
        if (!autoPush) {
            return false;
        }

        try {
            await execAsync('git push', { cwd: this.discussionRepoPath });
            return true;
        } catch (error) {
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
    async fetch(): Promise<boolean> {
        if (!this.discussionRepoPath) {
            return false;
        }

        if (!await this.hasRemote()) {
            return false;
        }

        try {
            await execAsync('git fetch', { cwd: this.discussionRepoPath });
            return true;
        } catch (error) {
            console.warn('Failed to fetch discussions:', error);
            return false;
        }
    }

    /**
     * Pull changes from the remote discussions repo
     */
    async pull(): Promise<boolean> {
        if (!this.discussionRepoPath) {
            return false;
        }

        if (!await this.hasRemote()) {
            return false;
        }

        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const autoFetch = config.get<boolean>('autoFetch', true);
        
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
        } catch (error) {
            const errorMessage = String(error);
            // Handle case where there's nothing to pull or merge conflicts
            if (errorMessage.includes('Already up to date')) {
                return true;
            }
            if (errorMessage.includes('CONFLICT') || errorMessage.includes('not possible to fast-forward')) {
                vscode.window.showWarningMessage(
                    'Merge conflict detected in discussions repo. Please resolve manually.',
                    'Open Discussions Repo'
                ).then(choice => {
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
    async hasIncomingChanges(): Promise<boolean> {
        if (!this.discussionRepoPath || !await this.hasRemote()) {
            return false;
        }

        try {
            await this.fetch();
            const result = await execAsync('git rev-list HEAD..@{u} --count', { cwd: this.discussionRepoPath });
            return parseInt(result.stdout.trim(), 10) > 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if there are outgoing changes (local is ahead)
     */
    async hasOutgoingChanges(): Promise<boolean> {
        if (!this.discussionRepoPath || !await this.hasRemote()) {
            return false;
        }

        try {
            const result = await execAsync('git rev-list @{u}..HEAD --count', { cwd: this.discussionRepoPath });
            return parseInt(result.stdout.trim(), 10) > 0;
        } catch {
            return false;
        }
    }

    /**
     * Start periodic sync (fetch + pull) for the discussions repo
     */
    startPeriodicSync(): void {
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const syncIntervalMinutes = config.get<number>('syncIntervalMinutes', 5);
        
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
            } catch (err) {
                console.warn('Periodic sync failed:', err);
            }
        }, syncIntervalMinutes * 60 * 1000);
    }

    /**
     * Stop periodic sync
     */
    stopPeriodicSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Manually sync with remote (pull then push)
     */
    async sync(): Promise<void> {
        await this.pull();
        await this.push();
    }

    /**
     * Get the uncommitted diff for a specific file in the code repo.
     * Returns the diff of working tree vs HEAD.
     * For new (untracked) files, returns a diff that creates the entire file.
     * Returns undefined if no changes or file doesn't exist.
     */
    async getFileDiff(relativePath: string): Promise<string | undefined> {
        if (!this.codeRepoPath) {
            return undefined;
        }

        try {
            // First, check if file is tracked
            const isTracked = await this.isFileTracked(relativePath);
            
            if (isTracked) {
                // Get diff of working tree vs HEAD for this specific file
                const result = await execAsync(
                    `git diff HEAD -- "${relativePath}"`, 
                    { cwd: this.codeRepoPath, maxBuffer: 10 * 1024 * 1024 }
                );
                const diff = result.stdout.trim();
                return diff.length > 0 ? diff : undefined;
            } else {
                // For untracked files, create a diff that represents adding the whole file
                // Use git diff with /dev/null to create a proper unified diff
                const result = await execAsync(
                    `git diff --no-index /dev/null "${relativePath}" || true`,
                    { cwd: this.codeRepoPath, maxBuffer: 10 * 1024 * 1024 }
                );
                const diff = result.stdout.trim();
                return diff.length > 0 ? diff : undefined;
            }
        } catch (error) {
            console.error(`Failed to get diff for ${relativePath}:`, error);
            return undefined;
        }
    }

    /**
     * Check if a file is tracked by git
     */
    private async isFileTracked(relativePath: string): Promise<boolean> {
        if (!this.codeRepoPath) {
            return false;
        }
        try {
            await execAsync(
                `git ls-files --error-unmatch "${relativePath}"`,
                { cwd: this.codeRepoPath }
            );
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file content at a specific commit.
     * Returns undefined if file doesn't exist at that commit.
     */
    async getFileAtCommit(relativePath: string, commitSha: string): Promise<string | undefined> {
        if (!this.codeRepoPath) {
            return undefined;
        }

        try {
            const result = await execAsync(
                `git show "${commitSha}:${relativePath}"`,
                { cwd: this.codeRepoPath, maxBuffer: 10 * 1024 * 1024 }
            );
            return result.stdout;
        } catch (error) {
            // File might not exist at that commit
            console.error(`Failed to get file at commit ${commitSha}:`, error);
            return undefined;
        }
    }

    /**
     * Reconstruct file content by applying a diff to file content at a specific commit.
     * This allows recreating the exact file state when a discussion was created,
     * even if those changes were never committed or committed differently.
     * 
     * @param relativePath - Relative path to the file
     * @param commitSha - The commit SHA to start from
     * @param diff - The diff to apply (optional, if undefined returns file at commit)
     * @returns The reconstructed file content, or undefined if reconstruction fails
     */
    async reconstructFileContent(
        relativePath: string, 
        commitSha: string, 
        diff?: string
    ): Promise<string | undefined> {
        if (!this.codeRepoPath) {
            return undefined;
        }

        // Get file at the commit
        const baseContent = await this.getFileAtCommit(relativePath, commitSha);
        
        // If file doesn't exist at the commit and we have a diff, 
        // it was a new file - apply diff to empty content
        if (baseContent === undefined) {
            if (diff) {
                // New file case: apply diff to empty string
                return this.applyUnifiedDiff('', diff);
            }
            // No diff and file doesn't exist - can't reconstruct
            return undefined;
        }

        // If no diff, return base content
        if (!diff) {
            return baseContent;
        }

        // Apply the diff using a simple unified diff parser
        return this.applyUnifiedDiff(baseContent, diff);
    }

    /**
     * Apply a unified diff to content.
     * This is a simple implementation that handles standard unified diff format.
     */
    private applyUnifiedDiff(content: string, diff: string): string {
        const lines = content.split('\n');
        const diffLines = diff.split('\n');
        
        // Parse hunks from the diff
        const hunks: Array<{
            oldStart: number;
            oldCount: number;
            changes: string[];
        }> = [];

        let currentHunk: typeof hunks[0] | null = null;

        for (const line of diffLines) {
            // Match hunk header: @@ -oldStart,oldCount +newStart,newCount @@
            const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (hunkMatch) {
                if (currentHunk) {
                    hunks.push(currentHunk);
                }
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1], 10),
                    oldCount: parseInt(hunkMatch[2] || '1', 10),
                    changes: [],
                };
                continue;
            }

            if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
                currentHunk.changes.push(line);
            }
        }

        if (currentHunk) {
            hunks.push(currentHunk);
        }

        // Apply hunks in reverse order to preserve line numbers
        const result = [...lines];
        for (const hunk of hunks.reverse()) {
            const startIndex = hunk.oldStart - 1; // Convert to 0-based
            let removeCount = 0;
            const insertLines: string[] = [];

            for (const change of hunk.changes) {
                if (change.startsWith('-')) {
                    removeCount++;
                } else if (change.startsWith('+')) {
                    insertLines.push(change.substring(1));
                } else if (change.startsWith(' ')) {
                    // Context line - include in insert, count as remove from old
                    insertLines.push(change.substring(1));
                    removeCount++;
                }
            }

            result.splice(startIndex, removeCount, ...insertLines);
        }

        return result.join('\n');
    }

    dispose(): void {
        this.stopPeriodicSync();
        this._onDidSync.dispose();
    }
}
