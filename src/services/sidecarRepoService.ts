/**
 * SidecarRepoService - Manages the sidecar discussions repository
 * 
 * Handles detection and linking of the discussions repo to the code repo.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface RepoLinkStatus {
    isLinked: boolean;
    codeRepoPath: string | null;
    discussionRepoPath: string | null;
    message: string;
}

export class SidecarRepoService {
    private _codeRepoPath: string | null = null;
    private _discussionRepoPath: string | null = null;
    private _onStatusChanged = new vscode.EventEmitter<RepoLinkStatus>();
    
    public readonly onStatusChanged = this._onStatusChanged.event;

    constructor() {}

    /**
     * Get the current code repo path
     */
    get codeRepoPath(): string | null {
        return this._codeRepoPath;
    }

    /**
     * Get the current discussions repo path
     */
    get discussionRepoPath(): string | null {
        return this._discussionRepoPath;
    }

    /**
     * Check if the repos are linked
     */
    get isLinked(): boolean {
        return this._codeRepoPath !== null && this._discussionRepoPath !== null;
    }

    /**
     * Initialize and detect the sidecar repo
     */
    async initialize(): Promise<RepoLinkStatus> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            return this.setStatus(false, null, null, 'No workspace folder open.');
        }

        const codeRepoPath = workspaceFolder.uri.fsPath;

        // Check if this is a Git repo
        if (!this.isGitRepo(codeRepoPath)) {
            return this.setStatus(false, null, null, 'Workspace is not a Git repository.');
        }

        this._codeRepoPath = codeRepoPath;

        // Try to find the discussions repo
        const discussionRepoPath = await this.findDiscussionRepo(codeRepoPath);
        
        if (discussionRepoPath) {
            return this.setStatus(true, codeRepoPath, discussionRepoPath, 
                `Linked to discussions repo: ${path.basename(discussionRepoPath)}`);
        }

        // Not found
        const repoName = path.basename(codeRepoPath);
        return this.setStatus(false, codeRepoPath, null,
            `No discussions repository found. Create '${repoName}.discuss' as a sibling folder or configure 'longLivedDiscussions.discussionRepoPath'.`);
    }

    /**
     * Find the discussions repo based on config or naming convention
     */
    private async findDiscussionRepo(codeRepoPath: string): Promise<string | null> {
        // Priority 1: Check VS Code setting
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const configuredPath = config.get<string>('discussionRepoPath');
        
        if (configuredPath && configuredPath.trim()) {
            const resolvedPath = path.isAbsolute(configuredPath) 
                ? configuredPath 
                : path.resolve(codeRepoPath, configuredPath);
            
            if (this.isGitRepo(resolvedPath)) {
                return resolvedPath;
            }
            
            vscode.window.showWarningMessage(
                `Configured discussion repo path '${configuredPath}' is not a valid Git repository.`
            );
        }

        // Priority 2: Sibling folder naming convention
        const repoName = path.basename(codeRepoPath);
        const siblingPath = path.join(path.dirname(codeRepoPath), `${repoName}.discuss`);
        
        if (this.isGitRepo(siblingPath)) {
            return siblingPath;
        }

        return null;
    }

    /**
     * Check if a path is a Git repository
     */
    private isGitRepo(repoPath: string): boolean {
        try {
            const gitPath = path.join(repoPath, '.git');
            return fs.existsSync(gitPath);
        } catch {
            return false;
        }
    }

    /**
     * Get the path to the discussions folder within the discussions repo
     */
    getDiscussionsFolderPath(): string | null {
        if (!this._discussionRepoPath) {
            return null;
        }
        return path.join(this._discussionRepoPath, 'discussions');
    }

    /**
     * Get the path to a specific discussion folder (new folder-per-discussion structure)
     */
    getDiscussionFolderPath(discussionId: string): string | null {
        const folder = this.getDiscussionsFolderPath();
        if (!folder) {
            return null;
        }
        return path.join(folder, discussionId);
    }

    /**
     * Get the path to a discussion's _meta.yml file
     */
    getDiscussionFilePath(discussionId: string): string | null {
        const discussionFolder = this.getDiscussionFolderPath(discussionId);
        if (!discussionFolder) {
            return null;
        }
        return path.join(discussionFolder, '_meta.yml');
    }

    /**
     * Ensure the discussions folder exists
     */
    async ensureDiscussionsFolderExists(): Promise<void> {
        const folder = this.getDiscussionsFolderPath();
        if (folder && !fs.existsSync(folder)) {
            await fs.promises.mkdir(folder, { recursive: true });
        }
    }

    /**
     * Ensure a specific discussion folder exists
     */
    async ensureDiscussionFolderExists(discussionId: string): Promise<void> {
        const folder = this.getDiscussionFolderPath(discussionId);
        if (folder && !fs.existsSync(folder)) {
            await fs.promises.mkdir(folder, { recursive: true });
        }
    }

    /**
     * Get the relative path from code repo to a file
     */
    getRelativePath(absolutePath: string): string {
        if (!this._codeRepoPath) {
            return absolutePath;
        }
        return path.relative(this._codeRepoPath, absolutePath);
    }

    /**
     * Get the absolute path from a relative path
     */
    getAbsolutePath(relativePath: string): string | null {
        if (!this._codeRepoPath) {
            return null;
        }
        return path.join(this._codeRepoPath, relativePath);
    }

    /**
     * Update status and fire event
     */
    private setStatus(
        isLinked: boolean, 
        codeRepoPath: string | null, 
        discussionRepoPath: string | null,
        message: string
    ): RepoLinkStatus {
        this._codeRepoPath = codeRepoPath;
        this._discussionRepoPath = discussionRepoPath;
        
        const status: RepoLinkStatus = {
            isLinked,
            codeRepoPath,
            discussionRepoPath,
            message,
        };
        
        this._onStatusChanged.fire(status);
        return status;
    }

    /**
     * Show notification about repo status
     */
    showStatusNotification(): void {
        if (!this.isLinked) {
            const repoName = this._codeRepoPath ? path.basename(this._codeRepoPath) : 'your-repo';
            vscode.window.showInformationMessage(
                `No discussions repository found. Create a sibling folder named '${repoName}.discuss' or configure the path in settings.`,
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'longLivedDiscussions.discussionRepoPath'
                    );
                }
            });
        }
    }

    dispose(): void {
        this._onStatusChanged.dispose();
    }
}
