/**
 * ReadMentionsStorage - Stores which mentions the user has read locally
 * 
 * This is stored in .vscode/discussions-read-mentions.json to avoid merge conflicts
 * in the shared discussions repository.
 * 
 * Since comment IDs are globally unique (c-XXXXXXXX format), we just store
 * a flat list of comment IDs that have been read.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Structure: { readCommentIds: ["c-abc12345", "c-def67890", ...] }
 * Simple list of comment IDs whose mentions have been marked as read
 */
interface ReadMentionsData {
    readCommentIds: string[];
}

export class ReadMentionsStorage {
    private data: ReadMentionsData = { readCommentIds: [] };
    private filePath: string | null = null;
    private _onDidChange = new vscode.EventEmitter<void>();
    
    public readonly onDidChange = this._onDidChange.event;

    /**
     * Initialize the storage with the workspace path
     */
    async initialize(workspacePath: string): Promise<void> {
        const vscodeFolder = path.join(workspacePath, '.vscode');
        this.filePath = path.join(vscodeFolder, 'discussions-read-mentions.json');

        // Ensure .vscode folder exists
        if (!fs.existsSync(vscodeFolder)) {
            await fs.promises.mkdir(vscodeFolder, { recursive: true });
        }

        // Load existing data
        await this.load();
    }

    /**
     * Load data from disk
     */
    private async load(): Promise<void> {
        if (!this.filePath) {
            return;
        }

        try {
            if (fs.existsSync(this.filePath)) {
                const content = await fs.promises.readFile(this.filePath, 'utf-8');
                const parsed = JSON.parse(content);
                // Handle both old format (object with discussionId keys) and new format
                if (Array.isArray(parsed.readCommentIds)) {
                    this.data = parsed;
                } else if (Array.isArray(parsed)) {
                    // Plain array format
                    this.data = { readCommentIds: parsed };
                } else {
                    // Old format or invalid - start fresh
                    this.data = { readCommentIds: [] };
                }
            }
        } catch (error) {
            console.error('Error loading read mentions data:', error);
            this.data = { readCommentIds: [] };
        }
    }

    /**
     * Save data to disk
     */
    private async save(): Promise<void> {
        if (!this.filePath) {
            return;
        }

        try {
            const content = JSON.stringify(this.data, null, 2);
            await fs.promises.writeFile(this.filePath, content, 'utf-8');
        } catch (error) {
            console.error('Error saving read mentions data:', error);
        }
    }

    /**
     * Check if a comment's mentions have been marked as read
     */
    isCommentRead(commentId: string): boolean {
        return this.data.readCommentIds.includes(commentId);
    }

    /**
     * Mark a comment's mentions as read
     */
    async markCommentRead(commentId: string): Promise<void> {
        if (!this.data.readCommentIds.includes(commentId)) {
            this.data.readCommentIds.push(commentId);
            await this.save();
            this._onDidChange.fire();
        }
    }

    /**
     * Mark multiple comments as read
     */
    async markCommentsRead(commentIds: string[]): Promise<void> {
        let changed = false;
        for (const commentId of commentIds) {
            if (!this.data.readCommentIds.includes(commentId)) {
                this.data.readCommentIds.push(commentId);
                changed = true;
            }
        }

        if (changed) {
            await this.save();
            this._onDidChange.fire();
        }
    }

    /**
     * Get all read comment IDs
     */
    getReadCommentIds(): string[] {
        return [...this.data.readCommentIds];
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
