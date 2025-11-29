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
exports.GitUserService = void 0;
const cp = __importStar(require("child_process"));
const models_1 = require("../models");
const utils_1 = require("../utils");
/**
 * Service for retrieving Git user information
 */
class GitUserService {
    cachedAuthor = null;
    logger = (0, utils_1.getLogger)();
    /**
     * Get the current user's author information from Git config
     * Falls back to VS Code settings if Git is not available
     */
    async getAuthor() {
        this.logger.trace('GitUserService', 'getAuthor');
        if (this.cachedAuthor) {
            this.logger.debug('Returning cached author', { name: this.cachedAuthor.name });
            return this.cachedAuthor;
        }
        try {
            const name = await this.getGitConfig('user.name');
            const email = await this.getGitConfig('user.email');
            if (name && email) {
                this.cachedAuthor = (0, models_1.createAuthor)(name, email);
                this.logger.info('Retrieved Git user info', { name, email });
                return this.cachedAuthor;
            }
            else {
                this.logger.warn('Git config incomplete', { name, email });
            }
        }
        catch (error) {
            this.logger.warn('Failed to get Git user info, using fallback', error);
        }
        // Fallback to generic user
        this.cachedAuthor = (0, models_1.createAuthor)('User', 'user@local');
        this.logger.info('Using fallback author', { name: this.cachedAuthor.name });
        return this.cachedAuthor;
    }
    /**
     * Get a Git configuration value
     */
    async getGitConfig(key) {
        this.logger.debug('Getting git config', { key });
        return new Promise((resolve) => {
            cp.exec(`git config --get ${key}`, (error, stdout) => {
                if (error) {
                    this.logger.debug('Git config key not found', { key, error: error.message });
                    resolve(null);
                }
                else {
                    const value = stdout.trim() || null;
                    this.logger.debug('Git config retrieved', { key, value });
                    resolve(value);
                }
            });
        });
    }
    /**
     * Clear the cached author (useful for testing)
     */
    clearCache() {
        this.logger.debug('Clearing cached author');
        this.cachedAuthor = null;
    }
}
exports.GitUserService = GitUserService;
//# sourceMappingURL=git-user.service.js.map