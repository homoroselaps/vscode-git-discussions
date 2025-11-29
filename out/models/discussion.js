"use strict";
/**
 * Data models for Long-Lived Git Discussions
 *
 * These interfaces match the YAML schema defined in the user story.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMENT_PREFIXES = void 0;
exports.getCommentPrefix = getCommentPrefix;
exports.formatAnchorComment = formatAnchorComment;
exports.generateDiscussionId = generateDiscussionId;
exports.isValidDiscussionId = isValidDiscussionId;
exports.createNewDiscussion = createNewDiscussion;
exports.addCommentToDiscussion = addCommentToDiscussion;
/**
 * Comment prefix mapping for different languages
 */
exports.COMMENT_PREFIXES = {
    'typescript': '//',
    'javascript': '//',
    'typescriptreact': '//',
    'javascriptreact': '//',
    'csharp': '//',
    'java': '//',
    'c': '//',
    'cpp': '//',
    'go': '//',
    'rust': '//',
    'swift': '//',
    'kotlin': '//',
    'scala': '//',
    'php': '//',
    'python': '#',
    'shellscript': '#',
    'bash': '#',
    'ruby': '#',
    'perl': '#',
    'r': '#',
    'yaml': '#',
    'dockerfile': '#',
    'makefile': '#',
    'haskell': '--',
    'lua': '--',
    'sql': '--',
    'html': '<!--',
    'xml': '<!--',
    'css': '/*',
    'scss': '//',
    'less': '//',
};
/**
 * Get the comment prefix for a given language ID
 */
function getCommentPrefix(languageId) {
    return exports.COMMENT_PREFIXES[languageId] || '//';
}
/**
 * Generate a discussion anchor comment for a given language and ID
 */
function formatAnchorComment(languageId, discussionId) {
    const prefix = getCommentPrefix(languageId);
    const anchor = `[discussion:${discussionId}]`;
    // Handle multi-character comment prefixes
    if (prefix === '<!--') {
        return `<!-- ${anchor} -->`;
    }
    if (prefix === '/*') {
        return `/* ${anchor} */`;
    }
    return `${prefix} ${anchor}`;
}
/**
 * Generate a unique discussion ID
 * Format: d-XXXXXXXX (d- prefix + 8 lowercase hex characters)
 */
function generateDiscussionId() {
    const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `d-${hex}`;
}
/**
 * Validate a discussion ID format
 */
function isValidDiscussionId(id) {
    return /^d-[a-f0-9]{8}$/.test(id);
}
/**
 * Create a new discussion with default values
 */
function createNewDiscussion(id, title, anchor, author, initialComment) {
    const now = new Date().toISOString();
    const discussion = {
        id,
        title,
        status: 'open',
        anchor,
        metadata: {
            created_by: author,
            created_at: now,
        },
        comments: [],
    };
    if (initialComment && initialComment.trim()) {
        discussion.comments.push({
            id: 1,
            author,
            created_at: now,
            body: initialComment.trim(),
        });
    }
    return discussion;
}
/**
 * Add a comment to a discussion and return the updated discussion
 */
function addCommentToDiscussion(discussion, author, body) {
    const maxId = discussion.comments.reduce((max, c) => Math.max(max, c.id), 0);
    const newComment = {
        id: maxId + 1,
        author,
        created_at: new Date().toISOString(),
        body: body.trim(),
    };
    return {
        ...discussion,
        comments: [...discussion.comments, newComment],
    };
}
//# sourceMappingURL=discussion.js.map