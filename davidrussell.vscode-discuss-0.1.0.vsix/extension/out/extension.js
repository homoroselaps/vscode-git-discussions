"use strict";
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const commands_1 = require("./commands");
const providers_1 = require("./providers");
const services_1 = require("./services");
const utils_1 = require("./utils");
const views_1 = require("./views");
let storageService = null;
let gitService = null;
let webviewProvider = null;
let decorationsService = null;
const logger = (0, utils_1.getLogger)();
/**
 * Extension activation
 */
async function activate(context) {
    // Log to console immediately for debugging packaged extensions
    console.log('[VSCodeDiscuss] Extension activation function called');
    logger.info('=== VSCode Discuss Activation Started ===');
    logger.debug('Extension context', { extensionPath: context.extensionPath });
    logger.show(); // Show output channel immediately
    try {
        // Initialize Git service first
        logger.info('Initializing GitService');
        gitService = new services_1.GitService();
        await gitService.initialize();
        // Wait for Git repositories to be discovered (Git extension discovers repositories asynchronously)
        logger.info('Waiting for Git repositories to be discovered...');
        const repository = await gitService.waitForRepositories(5000);
        if (!repository) {
            logger.warn('No Git repository found - extension requires Git repository');
            void vscode.window.showWarningMessage('VSCode Discuss requires a Git repository. Please open a folder containing a Git repository or initialize Git in the current folder.');
            return;
        }
        const repositoryRoot = repository.rootUri;
        logger.debug('Git repository found', {
            available: gitService.isAvailable(),
            repositoryRoot: repositoryRoot.fsPath,
        });
        logger.info('GitService initialized successfully', {
            available: gitService.isAvailable(),
            repositoryRoot: repositoryRoot.fsPath,
        });
        // Initialize storage service
        logger.info('Initializing StorageService', { repositoryRoot: repositoryRoot.fsPath });
        storageService = new services_1.StorageService(repositoryRoot.fsPath, gitService);
        await storageService.initialize();
        context.subscriptions.push({
            dispose: () => storageService?.dispose(),
        });
        logger.info('StorageService initialized successfully');
        // Initialize webview provider
        logger.info('Initializing Discussions Webview');
        webviewProvider = new views_1.DiscussionsWebviewProvider(context.extensionUri, storageService);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(views_1.DiscussionsWebviewProvider.viewType, webviewProvider));
        // Update webview context when active editor or selection changes
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            void webviewProvider?.updateEditorContext(editor);
        }));
        context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
            void webviewProvider?.updateEditorContext(event.textEditor);
        }));
        // Send initial editor context
        void webviewProvider.updateEditorContext(vscode.window.activeTextEditor);
        logger.info('Discussions Webview initialized successfully');
        // Initialize decorations service
        logger.info('Initializing Decorations Service');
        decorationsService = new services_1.DecorationsService();
        context.subscriptions.push(decorationsService);
        // Update decorations when discussions change
        const updateDecorations = async () => {
            if (decorationsService && storageService) {
                const discussions = await storageService.getDiscussions();
                decorationsService.updateDecorations(discussions);
            }
        };
        // Listen to webview discussion changes
        context.subscriptions.push(webviewProvider.onDidChangeDiscussions(() => {
            void updateDecorations();
        }));
        // Initial decoration update
        void updateDecorations();
        logger.info('Decorations Service initialized successfully');
        // Initialize discussions tree view
        logger.info('Initializing Discussions TreeView');
        const treeDataProvider = new providers_1.DiscussionsTreeDataProvider(storageService);
        const treeView = vscode.window.createTreeView('vscodeDiscussDiscussions', {
            treeDataProvider,
            showCollapseAll: true,
        });
        context.subscriptions.push(treeView);
        logger.info('Discussions TreeView initialized successfully');
        // Register commands
        logger.info('Registering extension commands');
        (0, commands_1.registerDiscussionCommands)(context, storageService, treeDataProvider);
        // Remove the showNewDiscussionInput command - no longer needed with persistent input
        logger.info('Commands registered successfully');
        // Dispose logger on deactivation
        context.subscriptions.push({
            dispose: () => logger.dispose(),
        });
        logger.info('=== VSCode Discuss Activation Completed Successfully ===');
    }
    catch (error) {
        console.error('[VSCodeDiscuss] ACTIVATION FAILED:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        logger.error('=== VSCode Discuss Activation FAILED ===', error);
        console.error('[VSCodeDiscuss] Error details:', { message: errorMessage, stack: errorStack });
        void vscode.window.showErrorMessage(`Failed to initialize VSCode Discuss: ${errorMessage}`);
        throw error; // Re-throw to ensure VS Code knows activation failed
    }
}
/**
 * Extension deactivation
 */
function deactivate() {
    logger.info('=== VSCode Discuss Deactivation Started ===');
    storageService?.dispose();
    storageService = null;
    gitService = null;
    decorationsService = null;
    logger.info('=== VSCode Discuss Deactivation Completed ===');
}
//# sourceMappingURL=extension.js.map