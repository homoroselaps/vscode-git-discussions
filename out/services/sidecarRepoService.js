"use strict";
/**
 * SidecarRepoService - Manages the sidecar discussions repository
 *
 * Handles detection and linking of the discussions repo to the code repo.
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
exports.SidecarRepoService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class SidecarRepoService {
    _codeRepoPath = null;
    _discussionRepoPath = null;
    _onStatusChanged = new vscode.EventEmitter();
    onStatusChanged = this._onStatusChanged.event;
    constructor() { }
    /**
     * Get the current code repo path
     */
    get codeRepoPath() {
        return this._codeRepoPath;
    }
    /**
     * Get the current discussions repo path
     */
    get discussionRepoPath() {
        return this._discussionRepoPath;
    }
    /**
     * Check if the repos are linked
     */
    get isLinked() {
        return this._codeRepoPath !== null && this._discussionRepoPath !== null;
    }
    /**
     * Initialize and detect the sidecar repo
     */
    async initialize() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return this.setStatus(false, null, null, 'No workspace folder open.');
        }
        const codeRepoPath = workspaceFolder.uri.fsPath;
        // Check if this is a Git repo
        if (!this.isGitRepo(codeRepoPath)) {
            return this.setStatus(false, null, null, 'Workspace is not a Git repository.');
        }
        this._codeRepoPath = codeRepoPath;
        // Try to find the discussions repo
        const discussionRepoPath = await this.findDiscussionRepo(codeRepoPath);
        if (discussionRepoPath) {
            return this.setStatus(true, codeRepoPath, discussionRepoPath, `Linked to discussions repo: ${path.basename(discussionRepoPath)}`);
        }
        // Not found
        const repoName = path.basename(codeRepoPath);
        return this.setStatus(false, codeRepoPath, null, `No discussions repository found. Create '${repoName}.discuss' as a sibling folder or configure 'longLivedDiscussions.discussionRepoPath'.`);
    }
    /**
     * Find the discussions repo based on config or naming convention
     */
    async findDiscussionRepo(codeRepoPath) {
        // Priority 1: Check VS Code setting
        const config = vscode.workspace.getConfiguration('longLivedDiscussions');
        const configuredPath = config.get('discussionRepoPath');
        if (configuredPath && configuredPath.trim()) {
            const resolvedPath = path.isAbsolute(configuredPath)
                ? configuredPath
                : path.resolve(codeRepoPath, configuredPath);
            if (this.isGitRepo(resolvedPath)) {
                return resolvedPath;
            }
            vscode.window.showWarningMessage(`Configured discussion repo path '${configuredPath}' is not a valid Git repository.`);
        }
        // Priority 2: Sibling folder naming convention
        const repoName = path.basename(codeRepoPath);
        const siblingPath = path.join(path.dirname(codeRepoPath), `${repoName}.discuss`);
        if (this.isGitRepo(siblingPath)) {
            return siblingPath;
        }
        return null;
    }
    /**
     * Check if a path is a Git repository
     */
    isGitRepo(repoPath) {
        try {
            const gitPath = path.join(repoPath, '.git');
            return fs.existsSync(gitPath);
        }
        catch {
            return false;
        }
    }
    /**
     * Get the path to the discussions folder within the discussions repo
     */
    getDiscussionsFolderPath() {
        if (!this._discussionRepoPath) {
            return null;
        }
        return path.join(this._discussionRepoPath, 'discussions');
    }
    /**
     * Get the path to a specific discussion YAML file
     */
    getDiscussionFilePath(discussionId) {
        const folder = this.getDiscussionsFolderPath();
        if (!folder) {
            return null;
        }
        return path.join(folder, `${discussionId}.yml`);
    }
    /**
     * Ensure the discussions folder exists
     */
    async ensureDiscussionsFolderExists() {
        const folder = this.getDiscussionsFolderPath();
        if (folder && !fs.existsSync(folder)) {
            await fs.promises.mkdir(folder, { recursive: true });
        }
    }
    /**
     * Get the relative path from code repo to a file
     */
    getRelativePath(absolutePath) {
        if (!this._codeRepoPath) {
            return absolutePath;
        }
        return path.relative(this._codeRepoPath, absolutePath);
    }
    /**
     * Get the absolute path from a relative path
     */
    getAbsolutePath(relativePath) {
        if (!this._codeRepoPath) {
            return null;
        }
        return path.join(this._codeRepoPath, relativePath);
    }
    /**
     * Update status and fire event
     */
    setStatus(isLinked, codeRepoPath, discussionRepoPath, message) {
        this._codeRepoPath = codeRepoPath;
        this._discussionRepoPath = discussionRepoPath;
        const status = {
            isLinked,
            codeRepoPath,
            discussionRepoPath,
            message,
        };
        this._onStatusChanged.fire(status);
        return status;
    }
    /**
     * Show notification about repo status
     */
    showStatusNotification() {
        if (!this.isLinked) {
            const repoName = this._codeRepoPath ? path.basename(this._codeRepoPath) : 'your-repo';
            vscode.window.showInformationMessage(`No discussions repository found. Create a sibling folder named '${repoName}.discuss' or configure the path in settings.`, 'Open Settings').then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'longLivedDiscussions.discussionRepoPath');
                }
            });
        }
    }
    dispose() {
        this._onStatusChanged.dispose();
    }
}
exports.SidecarRepoService = SidecarRepoService;
//# sourceMappingURL=sidecarRepoService.js.map