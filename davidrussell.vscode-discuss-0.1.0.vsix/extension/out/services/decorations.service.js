"use strict";
/**
 * Service for managing editor decorations for discussions
 * @format
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
exports.DecorationsService = void 0;
const vscode = __importStar(require("vscode"));
const models_1 = require("../models");
const utils_1 = require("../utils");
const logger = (0, utils_1.getLogger)();
/**
 * Manages visual decorations in the editor to show discussion locations
 */
class DecorationsService {
    decorationType;
    gutterDecorationType;
    disposables = [];
    discussions = [];
    constructor() {
        // Create decoration type for discussion highlights
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editorInfo.foreground'),
            borderRadius: '3px',
            isWholeLine: false,
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
        // Create decoration type for gutter icons
        this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' +
                Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="#0078d4" opacity="0.8"/>
              <text x="10" y="14" text-anchor="middle" font-size="12" fill="white" font-family="Arial">💬</text>
            </svg>`).toString('base64')),
            gutterIconSize: 'contain',
        });
        // Listen for active editor changes to update decorations
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.updateDecorationsForEditor(editor);
            }
        }));
        // Update decorations for current editor
        if (vscode.window.activeTextEditor) {
            this.updateDecorationsForEditor(vscode.window.activeTextEditor);
        }
    }
    /**
     * Update decorations for all open editors
     */
    updateDecorations(discussions) {
        // Only update if discussions have actually changed (prevents flicker)
        const discussionsChanged = this.discussions.length !== discussions.length ||
            JSON.stringify(this.discussions) !== JSON.stringify(discussions);
        if (!discussionsChanged) {
            logger.debug('Decorations unchanged, skipping update');
            return;
        }
        this.discussions = discussions;
        logger.debug('Updating decorations for all editors', { discussionCount: discussions.length });
        // Update all visible editors
        for (const editor of vscode.window.visibleTextEditors) {
            this.updateDecorationsForEditor(editor, discussions);
        }
    }
    /**
     * Update decorations for a specific editor
     */
    updateDecorationsForEditor(editor, discussions) {
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        logger.debug('DecorationsService', `Updating decorations for editor: ${filePath}`);
        // Use stored discussions if not provided
        const discussionsToUse = discussions || this.discussions;
        if (!discussionsToUse || discussionsToUse.length === 0) {
            editor.setDecorations(this.decorationType, []);
            editor.setDecorations(this.gutterDecorationType, []);
            return;
        }
        // Filter discussions for this file
        const fileDiscussions = discussionsToUse.filter((d) => d.filePath === filePath);
        if (fileDiscussions.length === 0) {
            editor.setDecorations(this.decorationType, []);
            editor.setDecorations(this.gutterDecorationType, []);
            return;
        }
        // Create decorations for each discussion
        const decorations = [];
        const gutterDecorations = [];
        for (const discussion of fileDiscussions) {
            const range = new vscode.Range(discussion.range.start.line, discussion.range.start.character, discussion.range.end.line, discussion.range.end.character);
            const isResolved = discussion.status === models_1.DiscussionStatus.Resolved;
            const commentCount = discussion.comments.length;
            // Create hover message
            const hoverMessage = new vscode.MarkdownString();
            hoverMessage.isTrusted = true;
            hoverMessage.appendMarkdown(`💬 **Discussion** ${isResolved ? '(Resolved)' : '(Active)'}\n\n`);
            hoverMessage.appendMarkdown(`📝 ${commentCount} comment${commentCount !== 1 ? 's' : ''}\n\n`);
            hoverMessage.appendMarkdown(`${discussion.comments[0]?.body.substring(0, 100) || ''}${discussion.comments[0]?.body.length > 100 ? '...' : ''}\n\n`);
            hoverMessage.appendMarkdown(`[Open Discussion](#)`);
            // Add decoration for the range
            decorations.push({
                range,
                hoverMessage,
            });
            // Add gutter decoration at the start line
            gutterDecorations.push({
                range: new vscode.Range(discussion.range.start.line, 0, discussion.range.start.line, 0),
                hoverMessage,
            });
        }
        editor.setDecorations(this.decorationType, decorations);
        editor.setDecorations(this.gutterDecorationType, gutterDecorations);
        logger.debug('Decorations applied', {
            filePath,
            decorationCount: decorations.length,
        });
    }
    /**
     * Clear all decorations
     */
    clearDecorations() {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.decorationType, []);
            editor.setDecorations(this.gutterDecorationType, []);
        }
    }
    /**
     * Dispose of resources
     */
    dispose() {
        this.decorationType.dispose();
        this.gutterDecorationType.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
exports.DecorationsService = DecorationsService;
//# sourceMappingURL=decorations.service.js.map