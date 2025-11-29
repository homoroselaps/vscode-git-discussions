"use strict";
/**
 * AnchorIndexer - Scans workspace files for discussion anchors
 *
 * Finds [discussion:id] patterns in source code comments.
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
exports.AnchorIndexer = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Regex pattern to find discussion anchors
// Matches [discussion:d-XXXXXXXX] where X is hex character
const ANCHOR_PATTERN = /\[discussion:(d-[a-f0-9]{8})\]/gi;
class AnchorIndexer {
    sidecarService;
    anchors = new Map();
    _onAnchorsChanged = new vscode.EventEmitter();
    onAnchorsChanged = this._onAnchorsChanged.event;
    constructor(sidecarService) {
        this.sidecarService = sidecarService;
    }
    /**
     * Get all indexed anchors
     */
    getAllAnchors() {
        return new Map(this.anchors);
    }
    /**
     * Get anchor by discussion ID
     */
    getAnchor(discussionId) {
        return this.anchors.get(discussionId);
    }
    /**
     * Check if a discussion ID has an anchor in the code
     */
    hasAnchor(discussionId) {
        return this.anchors.has(discussionId);
    }
    /**
     * Scan all workspace files for anchors
     */
    async scanWorkspace() {
        this.anchors.clear();
        const codeRepoPath = this.sidecarService.codeRepoPath;
        if (!codeRepoPath) {
            return;
        }
        // Get supported languages from config
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const supportedLanguages = config.get('supportedLanguages', [
            'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
            'csharp', 'java', 'python', 'go', 'rust', 'c', 'cpp', 'shellscript', 'ruby', 'php'
        ]);
        // Build file patterns from supported languages
        const patterns = this.buildFilePatterns(supportedLanguages);
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
            for (const file of files) {
                await this.scanFile(file);
            }
        }
        this._onAnchorsChanged.fire();
    }
    /**
     * Scan a single file for anchors
     */
    async scanFile(uri) {
        const foundAnchors = [];
        const codeRepoPath = this.sidecarService.codeRepoPath;
        if (!codeRepoPath) {
            return foundAnchors;
        }
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const lines = text.split('\n');
            // Remove existing anchors for this file
            this.removeAnchorsForFile(uri.fsPath);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let match;
                // Reset the regex for each line
                ANCHOR_PATTERN.lastIndex = 0;
                while ((match = ANCHOR_PATTERN.exec(line)) !== null) {
                    const discussionId = match[1].toLowerCase();
                    const anchor = {
                        id: discussionId,
                        filePath: uri.fsPath,
                        relativePath: path.relative(codeRepoPath, uri.fsPath),
                        line: i + 1, // 1-based line number
                        languageId: document.languageId,
                    };
                    this.anchors.set(discussionId, anchor);
                    foundAnchors.push(anchor);
                }
            }
        }
        catch (error) {
            console.error(`Error scanning file ${uri.fsPath}:`, error);
        }
        return foundAnchors;
    }
    /**
     * Remove all anchors for a specific file
     */
    removeAnchorsForFile(filePath) {
        for (const [id, anchor] of this.anchors) {
            if (anchor.filePath === filePath) {
                this.anchors.delete(id);
            }
        }
    }
    /**
     * Build glob patterns from language IDs
     */
    buildFilePatterns(languageIds) {
        const patterns = [];
        const extensionMap = {
            'typescript': ['ts'],
            'typescriptreact': ['tsx'],
            'javascript': ['js', 'mjs', 'cjs'],
            'javascriptreact': ['jsx'],
            'csharp': ['cs'],
            'java': ['java'],
            'python': ['py'],
            'go': ['go'],
            'rust': ['rs'],
            'c': ['c', 'h'],
            'cpp': ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
            'shellscript': ['sh', 'bash', 'zsh'],
            'ruby': ['rb'],
            'php': ['php'],
            'haskell': ['hs'],
            'lua': ['lua'],
            'sql': ['sql'],
            'yaml': ['yml', 'yaml'],
            'html': ['html', 'htm'],
            'css': ['css'],
            'scss': ['scss'],
            'less': ['less'],
        };
        for (const langId of languageIds) {
            const extensions = extensionMap[langId];
            if (extensions) {
                for (const ext of extensions) {
                    patterns.push(`**/*.${ext}`);
                }
            }
        }
        return [...new Set(patterns)]; // Remove duplicates
    }
    /**
     * Find anchor location in a document by discussion ID
     */
    findAnchorInDocument(document, discussionId) {
        const text = document.getText();
        const pattern = new RegExp(`\\[discussion:${discussionId}\\]`, 'i');
        const match = pattern.exec(text);
        if (match) {
            return document.positionAt(match.index);
        }
        return null;
    }
    /**
     * Group anchors by file path
     */
    getAnchorsByFile() {
        const byFile = new Map();
        for (const anchor of this.anchors.values()) {
            const existing = byFile.get(anchor.relativePath) || [];
            existing.push(anchor);
            byFile.set(anchor.relativePath, existing);
        }
        // Sort anchors within each file by line number
        for (const anchors of byFile.values()) {
            anchors.sort((a, b) => a.line - b.line);
        }
        return byFile;
    }
    /**
     * Get IDs of discussions that don't have anchors in the code
     */
    getOrphanedDiscussionIds(allDiscussionIds) {
        return allDiscussionIds.filter(id => !this.anchors.has(id));
    }
    dispose() {
        this._onAnchorsChanged.dispose();
    }
}
exports.AnchorIndexer = AnchorIndexer;
//# sourceMappingURL=anchorIndexer.js.map