"use strict";
/**
 * Discussion management commands for Command Palette
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
exports.registerDiscussionCommands = registerDiscussionCommands;
const vscode = __importStar(require("vscode"));
const utils_1 = require("../utils");
const logger = (0, utils_1.getLogger)();
/**
 * Register all discussion management commands
 */
function registerDiscussionCommands(context, storageService, treeDataProvider) {
    // Create discussion command - Simply focus the webview (persistent input is always visible)
    const createDiscussionCmd = vscode.commands.registerCommand('vscode-discuss.createNote', async () => {
        logger.trace('CommandHandler', 'createNote');
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showInformationMessage('Open a file to start a discussion.');
                return;
            }
            // Focus the webview - the persistent input will show the current context
            await vscode.commands.executeCommand('vscodeDiscuss.discussionsView.focus');
        }
        catch (error) {
            logger.error('Command createNote failed', error);
            throw error;
        }
    });
    // Show discussions command (Command Palette)
    const showDiscussionsCmd = vscode.commands.registerCommand('vscode-discuss.showDiscussions', async () => {
        logger.trace('CommandHandler', 'showDiscussions');
        try {
            const discussions = await storageService.getDiscussions();
            logger.info('Retrieved discussions', { count: discussions.length });
            if (discussions.length === 0) {
                await vscode.window.showInformationMessage('No discussions found in this workspace.');
                return;
            }
            // Show quick pick with discussion list
            const items = discussions.map((d) => ({
                label: `$(comment) ${d.comments[0]?.body.substring(0, 50) ?? 'Empty discussion'}`,
                description: d.filePath,
                detail: `${d.status} • ${d.comments.length} comment(s) • ${new Date(d.createdAt).toLocaleString()}`,
                discussion: d,
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a discussion to navigate to',
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (selected) {
                // Open the file and navigate to the discussion
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const uri = vscode.Uri.joinPath(workspaceFolder.uri, selected.discussion.filePath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(doc);
                    // Navigate to the range
                    const range = new vscode.Range(selected.discussion.range.start.line, selected.discussion.range.start.character, selected.discussion.range.end.line, selected.discussion.range.end.character);
                    editor.selection = new vscode.Selection(range.start, range.end);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                }
            }
        }
        catch (error) {
            logger.error('Command showDiscussions failed', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            await vscode.window.showErrorMessage(`Failed to show discussions: ${message}`);
        }
    });
    // Refresh discussions command (Command Palette)
    const refreshDiscussionsCmd = vscode.commands.registerCommand('vscode-discuss.refreshDiscussions', async () => {
        logger.trace('CommandHandler', 'refreshDiscussions');
        try {
            await storageService.reload();
            if (treeDataProvider) {
                treeDataProvider.refresh();
            }
            logger.info('Discussions reloaded from storage');
            await vscode.window.showInformationMessage('Discussions refreshed successfully!');
        }
        catch (error) {
            logger.error('Command refreshDiscussions failed', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            await vscode.window.showErrorMessage(`Failed to refresh discussions: ${message}`);
        }
    });
    // Open discussion command (triggered from TreeView)
    const openDiscussionCmd = vscode.commands.registerCommand('vscode-discuss.openDiscussion', async (discussion) => {
        logger.trace('CommandHandler', 'openDiscussion', { discussionId: discussion.id });
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const uri = vscode.Uri.joinPath(workspaceFolder.uri, discussion.filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc);
                // Navigate to the range
                const range = new vscode.Range(discussion.range.start.line, discussion.range.start.character, discussion.range.end.line, discussion.range.end.character);
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        }
        catch (error) {
            logger.error('Command openDiscussion failed', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            await vscode.window.showErrorMessage(`Failed to open discussion: ${message}`);
        }
    });
    // Add all commands to subscriptions
    context.subscriptions.push(createDiscussionCmd, showDiscussionsCmd, refreshDiscussionsCmd, openDiscussionCmd);
    logger.debug('Discussion commands registered', { count: 4 });
}
//# sourceMappingURL=discussion.commands.js.map