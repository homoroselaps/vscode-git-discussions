/**
 * ReadMentionsStorage - Stores which mentions the user has read
 * 
 * Uses VS Code's workspaceState for storage, which is:
 * - Per-user (each user has their own state)
 * - Per-workspace (different workspaces have separate states)
 * - Never committed to git (managed by VS Code internally)
 * 
 * Since comment IDs are globally unique (c-XXXXXXXX format), we just store
 * a flat list of comment IDs that have been read.
 */

import * as vscode from 'vscode';

const STORAGE_KEY = 'discussions.readCommentIds';

export class ReadMentionsStorage {
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;
    
    private context: vscode.ExtensionContext | null = null;

    /**
     * Initialize the storage with the extension context
     */
    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    /**
     * Get the stored read comment IDs from workspaceState
     */
    private getStoredIds(): string[] {
        if (!this.context) {
            return [];
        }
        return this.context.workspaceState.get<string[]>(STORAGE_KEY, []);
    }

    /**
     * Save read comment IDs to workspaceState
     */
    private async saveIds(ids: string[]): Promise<void> {
        if (!this.context) {
            return;
        }
        await this.context.workspaceState.update(STORAGE_KEY, ids);
    }

    /**
     * Refresh and notify listeners
     * (For workspaceState, the data is always current, but we still fire the event)
     */
    async refresh(): Promise<void> {
        this._onDidChange.fire();
    }

    /**
     * Check if a comment's mentions have been marked as read
     */
    isCommentRead(commentId: string): boolean {
        return this.getStoredIds().includes(commentId);
    }

    /**
     * Mark a comment's mentions as read
     */
    async markCommentRead(commentId: string): Promise<void> {
        const ids = this.getStoredIds();
        if (!ids.includes(commentId)) {
            ids.push(commentId);
            await this.saveIds(ids);
            this._onDidChange.fire();
        }
    }

    /**
     * Mark multiple comments as read
     */
    async markCommentsRead(commentIds: string[]): Promise<void> {
        const ids = this.getStoredIds();
        let changed = false;
        
        for (const commentId of commentIds) {
            if (!ids.includes(commentId)) {
                ids.push(commentId);
                changed = true;
            }
        }

        if (changed) {
            await this.saveIds(ids);
            this._onDidChange.fire();
        }
    }

    /**
     * Get all read comment IDs
     */
    getReadCommentIds(): string[] {
        return [...this.getStoredIds()];
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
