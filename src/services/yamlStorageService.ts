/**
 * YamlStorageService - Handles reading and writing discussion YAML files
 * 
 * Uses folder-per-discussion structure to avoid merge conflicts:
 * discussions/
 *   d-abc12345/
 *     _meta.yml                        # Discussion metadata (title, status, anchor)
 *     20251129T100000Z_c-11111111.yml  # Individual comment files
 *     20251129T100500Z_c-22222222.yml
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { 
    Discussion, 
    DiscussionMeta, 
    Comment,
    isValidDiscussionId,
    generateCommentFilename,
    parseCommentFilename,
} from '../models/discussion';
import { SidecarRepoService } from './sidecarRepoService';

export class YamlStorageService {
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private _onDiscussionsChanged = new vscode.EventEmitter<void>();
    
    public readonly onDiscussionsChanged = this._onDiscussionsChanged.event;

    constructor(private sidecarService: SidecarRepoService) {}

    /**
     * Initialize the service and set up file watcher
     */
    async initialize(): Promise<void> {
        const discussionsFolder = this.sidecarService.getDiscussionsFolderPath();
        if (!discussionsFolder) {
            return;
        }

        // Ensure the discussions folder exists
        await this.sidecarService.ensureDiscussionsFolderExists();

        // Set up file watcher for YAML files (recursive to catch comment files)
        const pattern = new vscode.RelativePattern(discussionsFolder, '**/*.yml');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        
        this.fileWatcher.onDidCreate(() => this._onDiscussionsChanged.fire());
        this.fileWatcher.onDidChange(() => this._onDiscussionsChanged.fire());
        this.fileWatcher.onDidDelete(() => this._onDiscussionsChanged.fire());
    }

    /**
     * Read a discussion's metadata from _meta.yml
     */
    private async readMeta(discussionId: string): Promise<DiscussionMeta | null> {
        const metaPath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!metaPath || !fs.existsSync(metaPath)) {
            return null;
        }

        try {
            const content = await fs.promises.readFile(metaPath, 'utf-8');
            const meta = yaml.load(content) as DiscussionMeta;
            
            if (!meta || !meta.id || meta.id !== discussionId) {
                console.warn(`Invalid discussion meta file: ${metaPath}`);
                return null;
            }

            return meta;
        } catch (error) {
            console.error(`Error reading discussion meta ${discussionId}:`, error);
            return null;
        }
    }

    /**
     * Read all comments for a discussion from individual files
     */
    private async readComments(discussionId: string): Promise<Comment[]> {
        const discussionFolder = this.sidecarService.getDiscussionFolderPath(discussionId);
        if (!discussionFolder || !fs.existsSync(discussionFolder)) {
            return [];
        }

        try {
            const files = await fs.promises.readdir(discussionFolder);
            const comments: Comment[] = [];

            // Filter and sort comment files by filename (which includes timestamp)
            const commentFiles = files
                .filter(f => parseCommentFilename(f) !== null)
                .sort(); // Lexicographic sort works because timestamp is first

            for (const filename of commentFiles) {
                const filePath = path.join(discussionFolder, filename);
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    const comment = yaml.load(content) as Comment;
                    if (comment && comment.id && comment.body !== undefined) {
                        comments.push(comment);
                    }
                } catch (error) {
                    console.warn(`Error reading comment file ${filename}:`, error);
                }
            }

            return comments;
        } catch (error) {
            console.error(`Error reading comments for ${discussionId}:`, error);
            return [];
        }
    }

    /**
     * Read a full discussion (metadata + all comments)
     */
    async readDiscussion(discussionId: string): Promise<Discussion | null> {
        const meta = await this.readMeta(discussionId);
        if (!meta) {
            return null;
        }

        const comments = await this.readComments(discussionId);

        return {
            ...meta,
            comments,
        };
    }

    /**
     * Write discussion metadata to _meta.yml (does not write comments)
     */
    async writeDiscussionMeta(discussion: Discussion | DiscussionMeta): Promise<void> {
        if (!isValidDiscussionId(discussion.id)) {
            throw new Error(`Invalid discussion ID: ${discussion.id}`);
        }

        // Ensure the discussion folder exists
        await this.sidecarService.ensureDiscussionFolderExists(discussion.id);

        const metaPath = this.sidecarService.getDiscussionFilePath(discussion.id);
        if (!metaPath) {
            throw new Error('Discussion repo not linked');
        }

        // Extract only meta fields (exclude comments)
        const meta: DiscussionMeta = {
            id: discussion.id,
            title: discussion.title,
            status: discussion.status,
            code_repo: discussion.code_repo,
            anchor: discussion.anchor,
            metadata: discussion.metadata,
        };

        const yamlContent = yaml.dump(meta, {
            indent: 2,
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
        });

        await fs.promises.writeFile(metaPath, yamlContent, 'utf-8');
    }

    /**
     * Write a single comment to its own file
     * Returns the relative path of the comment file (for git staging)
     */
    async writeComment(discussionId: string, comment: Comment): Promise<string> {
        if (!isValidDiscussionId(discussionId)) {
            throw new Error(`Invalid discussion ID: ${discussionId}`);
        }

        const discussionFolder = this.sidecarService.getDiscussionFolderPath(discussionId);
        if (!discussionFolder) {
            throw new Error('Discussion repo not linked');
        }

        // Ensure the discussion folder exists
        await this.sidecarService.ensureDiscussionFolderExists(discussionId);

        // Generate filename with timestamp
        const filename = generateCommentFilename(comment.id, comment.created_at);
        const filePath = path.join(discussionFolder, filename);

        const yamlContent = yaml.dump(comment, {
            indent: 2,
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
        });

        await fs.promises.writeFile(filePath, yamlContent, 'utf-8');

        // Return relative path for git staging
        return path.join('discussions', discussionId, filename);
    }

    /**
     * Write a full discussion (metadata + all comments)
     * Used primarily for creating new discussions with initial comment
     */
    async writeDiscussion(discussion: Discussion): Promise<void> {
        // Write metadata
        await this.writeDiscussionMeta(discussion);

        // Write each comment to its own file
        for (const comment of discussion.comments) {
            await this.writeComment(discussion.id, comment);
        }
    }

    /**
     * Delete a discussion folder and all its contents
     */
    async deleteDiscussion(discussionId: string): Promise<void> {
        const discussionFolder = this.sidecarService.getDiscussionFolderPath(discussionId);
        if (!discussionFolder) {
            throw new Error('Discussion repo not linked');
        }

        try {
            if (fs.existsSync(discussionFolder)) {
                await fs.promises.rm(discussionFolder, { recursive: true });
            }
        } catch (error) {
            throw new Error(`Failed to delete discussion: ${error}`);
        }
    }

    /**
     * List all discussion IDs from folders
     */
    async listAllDiscussionIds(): Promise<string[]> {
        const discussionsFolder = this.sidecarService.getDiscussionsFolderPath();
        if (!discussionsFolder || !fs.existsSync(discussionsFolder)) {
            return [];
        }

        try {
            const entries = await fs.promises.readdir(discussionsFolder, { withFileTypes: true });
            return entries
                .filter(e => e.isDirectory())
                .map(e => e.name)
                .filter(isValidDiscussionId);
        } catch (error) {
            console.error('Error listing discussions:', error);
            return [];
        }
    }

    /**
     * Load all discussions from YAML files
     */
    async loadAllDiscussions(): Promise<Discussion[]> {
        const ids = await this.listAllDiscussionIds();
        const discussions: Discussion[] = [];

        for (const id of ids) {
            const discussion = await this.readDiscussion(id);
            if (discussion) {
                discussions.push(discussion);
            }
        }

        return discussions;
    }

    /**
     * Check if a discussion ID already exists
     */
    async discussionExists(discussionId: string): Promise<boolean> {
        const discussionFolder = this.sidecarService.getDiscussionFolderPath(discussionId);
        if (!discussionFolder) {
            return false;
        }
        return fs.existsSync(discussionFolder);
    }

    /**
     * Generate a unique discussion ID that doesn't already exist
     */
    async generateUniqueId(): Promise<string> {
        const { generateDiscussionId } = await import('../models/discussion.js');
        
        let id: string;
        let attempts = 0;
        const maxAttempts = 100;

        do {
            id = generateDiscussionId();
            attempts++;
            if (attempts >= maxAttempts) {
                throw new Error('Failed to generate unique discussion ID after many attempts');
            }
        } while (await this.discussionExists(id));

        return id;
    }

    /**
     * Open a discussion's _meta.yml file in the editor
     */
    async openDiscussionFile(discussionId: string): Promise<void> {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            throw new Error('Discussion repo not linked');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`Discussion file not found: ${discussionId}`);
        }

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
    }

    dispose(): void {
        this.fileWatcher?.dispose();
        this._onDiscussionsChanged.dispose();
    }
}
