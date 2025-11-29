/**
 * YamlStorageService - Handles reading and writing discussion YAML files
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Discussion, isValidDiscussionId } from '../models/discussion';
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

        // Set up file watcher for YAML files
        const pattern = new vscode.RelativePattern(discussionsFolder, '*.yml');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        
        this.fileWatcher.onDidCreate(() => this._onDiscussionsChanged.fire());
        this.fileWatcher.onDidChange(() => this._onDiscussionsChanged.fire());
        this.fileWatcher.onDidDelete(() => this._onDiscussionsChanged.fire());
    }

    /**
     * Read a discussion from its YAML file
     */
    async readDiscussion(discussionId: string): Promise<Discussion | null> {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            return null;
        }

        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');
            const discussion = yaml.load(content) as Discussion;
            
            // Validate the loaded discussion
            if (!discussion || !discussion.id || discussion.id !== discussionId) {
                console.warn(`Invalid discussion file: ${filePath}`);
                return null;
            }

            return discussion;
        } catch (error) {
            console.error(`Error reading discussion ${discussionId}:`, error);
            return null;
        }
    }

    /**
     * Write a discussion to its YAML file
     */
    async writeDiscussion(discussion: Discussion): Promise<void> {
        if (!isValidDiscussionId(discussion.id)) {
            throw new Error(`Invalid discussion ID: ${discussion.id}`);
        }

        const filePath = this.sidecarService.getDiscussionFilePath(discussion.id);
        if (!filePath) {
            throw new Error('Discussion repo not linked');
        }

        // Ensure the discussions folder exists
        await this.sidecarService.ensureDiscussionsFolderExists();

        // Convert to YAML with nice formatting
        const yamlContent = yaml.dump(discussion, {
            indent: 2,
            lineWidth: -1, // Don't wrap lines
            quotingType: '"',
            forceQuotes: false,
        });

        await fs.promises.writeFile(filePath, yamlContent, 'utf-8');
    }

    /**
     * Delete a discussion YAML file
     */
    async deleteDiscussion(discussionId: string): Promise<void> {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            throw new Error('Discussion repo not linked');
        }

        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        } catch (error) {
            throw new Error(`Failed to delete discussion: ${error}`);
        }
    }

    /**
     * List all discussion IDs from YAML files
     */
    async listAllDiscussionIds(): Promise<string[]> {
        const discussionsFolder = this.sidecarService.getDiscussionsFolderPath();
        if (!discussionsFolder || !fs.existsSync(discussionsFolder)) {
            return [];
        }

        try {
            const files = await fs.promises.readdir(discussionsFolder);
            return files
                .filter(f => f.endsWith('.yml'))
                .map(f => path.basename(f, '.yml'))
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
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            return false;
        }
        return fs.existsSync(filePath);
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
     * Open a discussion YAML file in the editor
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
