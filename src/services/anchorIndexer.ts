/**
 * AnchorIndexer - Scans workspace files for discussion anchors
 * 
 * Finds [discussion:id] patterns in source code comments.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AnchorLocation, COMMENT_PREFIXES } from '../models/discussion';
import { SidecarRepoService } from './sidecarRepoService';

// Regex pattern to find discussion anchors
// Matches [discussion:d-XXXXXXXX] where X is hex character
const ANCHOR_PATTERN = /\[discussion:(d-[a-f0-9]{8})\]/gi;

export class AnchorIndexer {
    private anchors: Map<string, AnchorLocation> = new Map();
    private _onAnchorsChanged = new vscode.EventEmitter<void>();
    
    public readonly onAnchorsChanged = this._onAnchorsChanged.event;

    constructor(private sidecarService: SidecarRepoService) {}

    /**
     * Get all indexed anchors
     */
    getAllAnchors(): Map<string, AnchorLocation> {
        return new Map(this.anchors);
    }

    /**
     * Get anchor by discussion ID
     */
    getAnchor(discussionId: string): AnchorLocation | undefined {
        return this.anchors.get(discussionId);
    }

    /**
     * Check if a discussion ID has an anchor in the code
     */
    hasAnchor(discussionId: string): boolean {
        return this.anchors.has(discussionId);
    }

    /**
     * Scan all workspace files for anchors
     */
    async scanWorkspace(): Promise<void> {
        this.anchors.clear();

        const codeRepoPath = this.sidecarService.codeRepoPath;
        if (!codeRepoPath) {
            return;
        }

        // Get supported languages from config
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const supportedLanguages = config.get<string[]>('supportedLanguages', [
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
    async scanFile(uri: vscode.Uri): Promise<AnchorLocation[]> {
        const foundAnchors: AnchorLocation[] = [];
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
                let match: RegExpExecArray | null;
                
                // Reset the regex for each line
                ANCHOR_PATTERN.lastIndex = 0;
                
                while ((match = ANCHOR_PATTERN.exec(line)) !== null) {
                    const discussionId = match[1].toLowerCase();
                    const anchor: AnchorLocation = {
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
        } catch (error) {
            console.error(`Error scanning file ${uri.fsPath}:`, error);
        }

        return foundAnchors;
    }

    /**
     * Remove all anchors for a specific file
     */
    private removeAnchorsForFile(filePath: string): void {
        for (const [id, anchor] of this.anchors) {
            if (anchor.filePath === filePath) {
                this.anchors.delete(id);
            }
        }
    }

    /**
     * Build glob patterns from language IDs
     */
    private buildFilePatterns(languageIds: string[]): string[] {
        const patterns: string[] = [];
        const extensionMap: Record<string, string[]> = {
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
    findAnchorInDocument(document: vscode.TextDocument, discussionId: string): vscode.Position | null {
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
    getAnchorsByFile(): Map<string, AnchorLocation[]> {
        const byFile = new Map<string, AnchorLocation[]>();
        
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
    getOrphanedDiscussionIds(allDiscussionIds: string[]): string[] {
        return allDiscussionIds.filter(id => !this.anchors.has(id));
    }

    dispose(): void {
        this._onAnchorsChanged.dispose();
    }
}
