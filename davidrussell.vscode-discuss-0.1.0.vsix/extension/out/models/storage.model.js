"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_VERSION = void 0;
exports.createEmptyStorage = createEmptyStorage;
exports.updateStorage = updateStorage;
exports.isValidStorageVersion = isValidStorageVersion;
/**
 * Current storage format version
 */
exports.STORAGE_VERSION = '1.0.0';
/**
 * Factory function to create an empty storage container
 */
function createEmptyStorage() {
    return {
        version: exports.STORAGE_VERSION,
        lastUpdated: new Date().toISOString(),
        discussions: [],
    };
}
/**
 * Update storage with new discussions array
 */
function updateStorage(storage, discussions) {
    return {
        ...storage,
        discussions,
        lastUpdated: new Date().toISOString(),
    };
}
/**
 * Validate storage format version
 */
function isValidStorageVersion(version) {
    // For now, only support current version
    // In future, implement migration logic
    return version === exports.STORAGE_VERSION;
}
//# sourceMappingURL=storage.model.js.map