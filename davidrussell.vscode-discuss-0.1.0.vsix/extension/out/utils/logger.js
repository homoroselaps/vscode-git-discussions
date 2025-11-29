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
exports.Logger = exports.LogLevel = void 0;
exports.getLogger = getLogger;
const vscode = __importStar(require("vscode"));
/**
 * Log levels for filtering output
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Debug"] = 0] = "Debug";
    LogLevel[LogLevel["Info"] = 1] = "Info";
    LogLevel[LogLevel["Warn"] = 2] = "Warn";
    LogLevel[LogLevel["Error"] = 3] = "Error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Centralized logging service for VSCode Discuss extension
 * Provides structured logging to output channel and console
 */
class Logger {
    static instance = null;
    outputChannel;
    logLevel = LogLevel.Debug;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('VSCode Discuss');
    }
    /**
     * Get the singleton logger instance
     */
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    /**
     * Set the minimum log level to display
     */
    setLogLevel(level) {
        this.logLevel = level;
        this.info(`Log level set to ${LogLevel[level]}`);
    }
    /**
     * Show the output channel
     */
    show() {
        this.outputChannel.show();
    }
    /**
     * Log debug information (detailed diagnostic info)
     */
    debug(message, data) {
        this.log(LogLevel.Debug, message, data);
    }
    /**
     * Log informational messages
     */
    info(message, data) {
        this.log(LogLevel.Info, message, data);
    }
    /**
     * Log warnings
     */
    warn(message, data) {
        this.log(LogLevel.Warn, message, data);
    }
    /**
     * Log errors
     */
    error(message, error) {
        this.log(LogLevel.Error, message, error);
        // For errors, also log stack trace if available
        if (error instanceof Error && error.stack) {
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }
        // Always show output channel on errors
        this.show();
    }
    /**
     * Log a method entry (for tracing execution flow)
     */
    trace(className, methodName, data) {
        this.debug(`[${className}.${methodName}] Called`, data);
    }
    /**
     * Log performance timing
     */
    time(label) {
        const start = Date.now();
        this.debug(`[Timer] ${label} started`);
        return () => {
            const duration = Date.now() - start;
            this.debug(`[Timer] ${label} completed in ${duration}ms`);
        };
    }
    /**
     * Core logging method
     */
    log(level, message, data) {
        if (level < this.logLevel) {
            return;
        }
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level].padEnd(5);
        const formattedMessage = `[${timestamp}] [${levelName}] ${message}`;
        // Log to output channel
        this.outputChannel.appendLine(formattedMessage);
        if (data !== undefined) {
            const dataStr = this.formatData(data);
            this.outputChannel.appendLine(`  Data: ${dataStr}`);
        }
        // Always log to console for debugging (helpful for packaged extensions)
        const consoleMethod = this.getConsoleMethod(level);
        if (data !== undefined) {
            consoleMethod(`[VSCodeDiscuss] ${formattedMessage}`, data);
        }
        else {
            consoleMethod(`[VSCodeDiscuss] ${formattedMessage}`);
        }
    }
    /**
     * Format data for logging
     */
    formatData(data) {
        if (data === null) {
            return 'null';
        }
        if (data === undefined) {
            return 'undefined';
        }
        if (typeof data === 'string') {
            return data;
        }
        if (data instanceof Error) {
            return `${data.name}: ${data.message}`;
        }
        try {
            return JSON.stringify(data, null, 2);
        }
        catch {
            return String(data);
        }
    }
    /**
     * Get appropriate console method for log level
     */
    getConsoleMethod(level) {
        switch (level) {
            case LogLevel.Debug:
                return console.debug;
            case LogLevel.Info:
                return console.log;
            case LogLevel.Warn:
                return console.warn;
            case LogLevel.Error:
                return console.error;
            default:
                return console.log;
        }
    }
    /**
     * Dispose of resources
     */
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.Logger = Logger;
/**
 * Get the global logger instance
 */
function getLogger() {
    return Logger.getInstance();
}
//# sourceMappingURL=logger.js.map