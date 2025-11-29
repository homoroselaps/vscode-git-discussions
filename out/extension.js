"use strict";
/**
 * Long-Lived Git Discussions - VS Code Extension
 *
 * Anchor long-lived discussions to code and store them in a separate sidecar Git repository.
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidecarRepoService_js_1 = require("./services/sidecarRepoService.js");
const gitService_js_1 = require("./services/gitService.js");
const yamlStorageService_js_1 = require("./services/yamlStorageService.js");
const anchorIndexer_js_1 = require("./services/anchorIndexer.js");
const readMentionsStorage_js_1 = require("./services/readMentionsStorage.js");
const discussionsTreeDataProvider_js_1 = require("./providers/discussionsTreeDataProvider.js");
const discussionWebviewProvider_js_1 = require("./providers/discussionWebviewProvider.js");
const commandHandlers_js_1 = require("./commands/commandHandlers.js");
// Services
let sidecarService;
let gitService;
let yamlStorage;
let anchorIndexer;
let readMentionsStorage;
// Providers
let treeDataProvider;
let webviewProvider;
// Commands
let commandHandlers;
async function activate(context) {
    console.log('Long-Lived Discussions extension is now active!');
    // Initialize services
    sidecarService = new sidecarRepoService_js_1.SidecarRepoService();
    gitService = new gitService_js_1.GitService();
    yamlStorage = new yamlStorageService_js_1.YamlStorageService(sidecarService);
    anchorIndexer = new anchorIndexer_js_1.AnchorIndexer(sidecarService);
    readMentionsStorage = new readMentionsStorage_js_1.ReadMentionsStorage();
    // Initialize providers
    treeDataProvider = new discussionsTreeDataProvider_js_1.DiscussionsTreeDataProvider(yamlStorage, anchorIndexer, sidecarService, gitService, readMentionsStorage);
    webviewProvider = new discussionWebviewProvider_js_1.DiscussionWebviewProvider(context.extensionUri, yamlStorage, gitService, anchorIndexer, treeDataProvider, readMentionsStorage);
    // Initialize command handlers
    commandHandlers = new commandHandlers_js_1.CommandHandlers(sidecarService, yamlStorage, anchorIndexer, gitService, treeDataProvider, readMentionsStorage);
    // Register tree view
    const treeView = vscode.window.createTreeView('longLivedDiscussionsView', {
        treeDataProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    // Register webview provider for chat panel
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(discussionWebviewProvider_js_1.DiscussionWebviewProvider.viewType, webviewProvider));
    // When a discussion is selected in tree view, show it in the chat panel
    treeView.onDidChangeSelection(async (e) => {
        const selected = e.selection[0];
        if (selected && selected.discussion) {
            await webviewProvider.showDiscussion(selected.discussion);
        }
    });
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('longLivedDiscussions.createDiscussion', () => commandHandlers.createDiscussion()), vscode.commands.registerCommand('longLivedDiscussions.addComment', (item) => commandHandlers.addComment(item?.discussion)), vscode.commands.registerCommand('longLivedDiscussions.closeDiscussion', async (item) => {
        await commandHandlers.closeDiscussion(item?.discussion);
        await webviewProvider.refresh();
    }), vscode.commands.registerCommand('longLivedDiscussions.closeAndRemoveAnchor', async (item) => {
        await commandHandlers.closeAndRemoveAnchor(item?.discussion);
        await webviewProvider.refresh();
    }), vscode.commands.registerCommand('longLivedDiscussions.openDiscussion', async (discussion) => {
        await commandHandlers.openDiscussion(discussion);
        if (discussion) {
            await webviewProvider.showDiscussion(discussion);
        }
    }), vscode.commands.registerCommand('longLivedDiscussions.goToAnchor', (item) => commandHandlers.goToAnchor(item?.discussion)), vscode.commands.registerCommand('longLivedDiscussions.openYamlFile', (item) => commandHandlers.openYamlFile(item?.discussion)), vscode.commands.registerCommand('longLivedDiscussions.refresh', async () => {
        await commandHandlers.refresh();
        await webviewProvider.refresh();
    }), vscode.commands.registerCommand('longLivedDiscussions.sync', async () => {
        const hasRemote = await gitService.hasRemote();
        if (!hasRemote) {
            vscode.window.showInformationMessage('No remote configured for discussions repository.');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing discussions...',
            cancellable: false
        }, async () => {
            await gitService.sync();
        });
        await commandHandlers.refresh();
        await webviewProvider.refresh();
        vscode.window.showInformationMessage('Discussions synced with remote.');
    }), vscode.commands.registerCommand('longLivedDiscussions.markAllMentionsRead', async (item) => {
        await commandHandlers.markAllMentionsRead(item?.discussion);
        await webviewProvider.refresh();
    }));
    // Refresh views when sync brings new data from remote
    context.subscriptions.push(gitService.onDidSync(async () => {
        await commandHandlers.refresh();
        await webviewProvider.refresh();
    }));
    // Register disposables
    context.subscriptions.push(sidecarService, gitService, yamlStorage, anchorIndexer, readMentionsStorage, treeDataProvider);
    // Watch for file saves to re-scan anchors
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        // Re-scan the saved file for anchors
        await anchorIndexer.scanFile(document.uri);
        await treeDataProvider.refresh();
    }));
    // Watch for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('longLivedDiscussions')) {
            // Re-initialize with new settings
            await initializeExtension();
        }
    }));
    // Initialize the extension
    await initializeExtension();
}
/**
 * Initialize or re-initialize the extension
 */
async function initializeExtension() {
    // Detect sidecar repo
    const status = await sidecarService.initialize();
    if (status.isLinked) {
        console.log(`Linked to discussions repo: ${status.discussionRepoPath}`);
        // Initialize Git service
        gitService.initialize(status.codeRepoPath, status.discussionRepoPath);
        // Initialize YAML storage
        await yamlStorage.initialize();
        // Initialize read mentions storage (stored in code repo's .vscode folder)
        await readMentionsStorage.initialize(status.codeRepoPath);
        // Scan for anchors
        await anchorIndexer.scanWorkspace();
        // Refresh tree view
        await treeDataProvider.refresh();
        // Start periodic sync with remote (if configured)
        gitService.startPeriodicSync();
    }
    else {
        console.log('No discussions repo found:', status.message);
        // Show notification after a short delay (to not interrupt startup)
        setTimeout(() => {
            if (!sidecarService.isLinked) {
                sidecarService.showStatusNotification();
            }
        }, 2000);
    }
}
function deactivate() {
    console.log('Long-Lived Discussions extension is now deactivated.');
}
//# sourceMappingURL=extension.js.map