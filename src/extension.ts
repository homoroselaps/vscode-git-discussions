/**
 * Long-Lived Git Discussions - VS Code Extension
 * 
 * Anchor long-lived discussions to code and store them in a separate sidecar Git repository.
 */

import * as vscode from 'vscode';
import { SidecarRepoService } from './services/sidecarRepoService.js';
import { GitService } from './services/gitService.js';
import { YamlStorageService } from './services/yamlStorageService.js';
import { AnchorIndexer } from './services/anchorIndexer.js';
import { ReadMentionsStorage } from './services/readMentionsStorage.js';
import { DiscussionsTreeDataProvider } from './providers/discussionsTreeDataProvider.js';
import { DiscussionWebviewProvider } from './providers/discussionWebviewProvider.js';
import { CommandHandlers } from './commands/commandHandlers.js';

// Services
let sidecarService: SidecarRepoService;
let gitService: GitService;
let yamlStorage: YamlStorageService;
let anchorIndexer: AnchorIndexer;
let readMentionsStorage: ReadMentionsStorage;

// Providers
let treeDataProvider: DiscussionsTreeDataProvider;
let webviewProvider: DiscussionWebviewProvider;

// Commands
let commandHandlers: CommandHandlers;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Long-Lived Discussions extension is now active!');

    // Initialize services
    sidecarService = new SidecarRepoService();
    gitService = new GitService();
    yamlStorage = new YamlStorageService(sidecarService);
    anchorIndexer = new AnchorIndexer(sidecarService);
    readMentionsStorage = new ReadMentionsStorage();

    // Initialize providers
    treeDataProvider = new DiscussionsTreeDataProvider(yamlStorage, anchorIndexer, sidecarService, gitService, readMentionsStorage);
    webviewProvider = new DiscussionWebviewProvider(
        context.extensionUri,
        yamlStorage,
        gitService,
        anchorIndexer,
        treeDataProvider,
        readMentionsStorage
    );

    // Initialize command handlers
    commandHandlers = new CommandHandlers(
        sidecarService,
        yamlStorage,
        anchorIndexer,
        gitService,
        treeDataProvider,
        readMentionsStorage
    );

    // Register tree view
    const treeView = vscode.window.createTreeView('longLivedDiscussionsView', {
        treeDataProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Register webview provider for chat panel
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DiscussionWebviewProvider.viewType,
            webviewProvider
        )
    );

    // When a discussion is selected in tree view, show it in the chat panel
    treeView.onDidChangeSelection(async (e) => {
        const selected = e.selection[0];
        if (selected && selected.discussion) {
            await webviewProvider.showDiscussion(selected.discussion);
        }
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('longLivedDiscussions.createDiscussion', () => 
            commandHandlers.createDiscussion()
        ),
        vscode.commands.registerCommand('longLivedDiscussions.addComment', (item) => 
            commandHandlers.addComment(item?.discussion)
        ),
        vscode.commands.registerCommand('longLivedDiscussions.closeDiscussion', async (item) => {
            await commandHandlers.closeDiscussion(item?.discussion);
            await webviewProvider.refresh();
        }),
        vscode.commands.registerCommand('longLivedDiscussions.closeAndRemoveAnchor', async (item) => {
            await commandHandlers.closeAndRemoveAnchor(item?.discussion);
            await webviewProvider.refresh();
        }),
        vscode.commands.registerCommand('longLivedDiscussions.openDiscussion', async (discussion) => {
            await commandHandlers.openDiscussion(discussion);
            if (discussion) {
                await webviewProvider.showDiscussion(discussion);
            }
        }),
        vscode.commands.registerCommand('longLivedDiscussions.goToAnchor', (item) => 
            commandHandlers.goToAnchor(item?.discussion)
        ),
        vscode.commands.registerCommand('longLivedDiscussions.openYamlFile', (item) => 
            commandHandlers.openYamlFile(item?.discussion)
        ),
        vscode.commands.registerCommand('longLivedDiscussions.refresh', async () => {
            await commandHandlers.refresh();
            await webviewProvider.refresh();
        }),
        vscode.commands.registerCommand('longLivedDiscussions.sync', async () => {
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
        }),
        vscode.commands.registerCommand('longLivedDiscussions.markAllMentionsRead', async (item) => {
            await commandHandlers.markAllMentionsRead(item?.discussion);
            await webviewProvider.refresh();
        }),
    );

    // Refresh views when sync brings new data from remote
    context.subscriptions.push(
        gitService.onDidSync(async () => {
            await commandHandlers.refresh();
            await webviewProvider.refresh();
        })
    );

    // Register disposables
    context.subscriptions.push(
        sidecarService,
        gitService,
        yamlStorage,
        anchorIndexer,
        readMentionsStorage,
        treeDataProvider,
    );

    // Watch for file saves to re-scan anchors
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            // Re-scan the saved file for anchors
            await anchorIndexer.scanFile(document.uri);
            await treeDataProvider.refresh();
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('longLivedDiscussions')) {
                // Re-initialize with new settings
                await initializeExtension();
            }
        })
    );

    // Initialize the extension
    await initializeExtension();
}

/**
 * Initialize or re-initialize the extension
 */
async function initializeExtension(): Promise<void> {
    // Detect sidecar repo
    const status = await sidecarService.initialize();
    
    if (status.isLinked) {
        console.log(`Linked to discussions repo: ${status.discussionRepoPath}`);
        
        // Initialize Git service
        gitService.initialize(status.codeRepoPath!, status.discussionRepoPath!);
        
        // Initialize YAML storage
        await yamlStorage.initialize();
        
        // Initialize read mentions storage (stored in code repo's .vscode folder)
        await readMentionsStorage.initialize(status.codeRepoPath!);
        
        // Scan for anchors
        await anchorIndexer.scanWorkspace();
        
        // Refresh tree view
        await treeDataProvider.refresh();
        
        // Start periodic sync with remote (if configured)
        gitService.startPeriodicSync();
    } else {
        console.log('No discussions repo found:', status.message);
        // Show notification after a short delay (to not interrupt startup)
        setTimeout(() => {
            if (!sidecarService.isLinked) {
                sidecarService.showStatusNotification();
            }
        }, 2000);
    }
}

export function deactivate() {
    console.log('Long-Lived Discussions extension is now deactivated.');
}
