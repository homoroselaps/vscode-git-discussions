"use strict";
/**
 * ReadMentionsStorage - Stores which mentions the user has read locally
 *
 * This is stored in .vscode/discussions-read-mentions.json to avoid merge conflicts
 * in the shared discussions repository.
 *
 * Since comment IDs are globally unique (c-XXXXXXXX format), we just store
 * a flat list of comment IDs that have been read.
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
exports.ReadMentionsStorage = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ReadMentionsStorage {
    data = { readCommentIds: [] };
    filePath = null;
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    /**
     * Initialize the storage with the workspace path
     */
    async initialize(workspacePath) {
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
    async load() {
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
                }
                else if (Array.isArray(parsed)) {
                    // Plain array format
                    this.data = { readCommentIds: parsed };
                }
                else {
                    // Old format or invalid - start fresh
                    this.data = { readCommentIds: [] };
                }
            }
        }
        catch (error) {
            console.error('Error loading read mentions data:', error);
            this.data = { readCommentIds: [] };
        }
    }
    /**
     * Save data to disk
     */
    async save() {
        if (!this.filePath) {
            return;
        }
        try {
            const content = JSON.stringify(this.data, null, 2);
            await fs.promises.writeFile(this.filePath, content, 'utf-8');
        }
        catch (error) {
            console.error('Error saving read mentions data:', error);
        }
    }
    /**
     * Check if a comment's mentions have been marked as read
     */
    isCommentRead(commentId) {
        return this.data.readCommentIds.includes(commentId);
    }
    /**
     * Mark a comment's mentions as read
     */
    async markCommentRead(commentId) {
        if (!this.data.readCommentIds.includes(commentId)) {
            this.data.readCommentIds.push(commentId);
            await this.save();
            this._onDidChange.fire();
        }
    }
    /**
     * Mark multiple comments as read
     */
    async markCommentsRead(commentIds) {
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
    getReadCommentIds() {
        return [...this.data.readCommentIds];
    }
    dispose() {
        this._onDidChange.dispose();
    }
}
exports.ReadMentionsStorage = ReadMentionsStorage;
//# sourceMappingURL=readMentionsStorage.js.map