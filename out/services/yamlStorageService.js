"use strict";
/**
 * YamlStorageService - Handles reading and writing discussion YAML files
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
exports.YamlStorageService = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const discussion_1 = require("../models/discussion");
class YamlStorageService {
    sidecarService;
    fileWatcher = null;
    _onDiscussionsChanged = new vscode.EventEmitter();
    onDiscussionsChanged = this._onDiscussionsChanged.event;
    constructor(sidecarService) {
        this.sidecarService = sidecarService;
    }
    /**
     * Initialize the service and set up file watcher
     */
    async initialize() {
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
    async readDiscussion(discussionId) {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            return null;
        }
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const discussion = yaml.load(content);
            // Validate the loaded discussion
            if (!discussion || !discussion.id || discussion.id !== discussionId) {
                console.warn(`Invalid discussion file: ${filePath}`);
                return null;
            }
            return discussion;
        }
        catch (error) {
            console.error(`Error reading discussion ${discussionId}:`, error);
            return null;
        }
    }
    /**
     * Write a discussion to its YAML file
     */
    async writeDiscussion(discussion) {
        if (!(0, discussion_1.isValidDiscussionId)(discussion.id)) {
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
    async deleteDiscussion(discussionId) {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            throw new Error('Discussion repo not linked');
        }
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        }
        catch (error) {
            throw new Error(`Failed to delete discussion: ${error}`);
        }
    }
    /**
     * List all discussion IDs from YAML files
     */
    async listAllDiscussionIds() {
        const discussionsFolder = this.sidecarService.getDiscussionsFolderPath();
        if (!discussionsFolder || !fs.existsSync(discussionsFolder)) {
            return [];
        }
        try {
            const files = await fs.promises.readdir(discussionsFolder);
            return files
                .filter(f => f.endsWith('.yml'))
                .map(f => path.basename(f, '.yml'))
                .filter(discussion_1.isValidDiscussionId);
        }
        catch (error) {
            console.error('Error listing discussions:', error);
            return [];
        }
    }
    /**
     * Load all discussions from YAML files
     */
    async loadAllDiscussions() {
        const ids = await this.listAllDiscussionIds();
        const discussions = [];
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
    async discussionExists(discussionId) {
        const filePath = this.sidecarService.getDiscussionFilePath(discussionId);
        if (!filePath) {
            return false;
        }
        return fs.existsSync(filePath);
    }
    /**
     * Generate a unique discussion ID that doesn't already exist
     */
    async generateUniqueId() {
        const { generateDiscussionId } = await import('../models/discussion.js');
        let id;
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
    async openDiscussionFile(discussionId) {
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
    dispose() {
        this.fileWatcher?.dispose();
        this._onDiscussionsChanged.dispose();
    }
}
exports.YamlStorageService = YamlStorageService;
//# sourceMappingURL=yamlStorageService.js.map