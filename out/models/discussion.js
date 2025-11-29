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
exports.generateCommentId = generateCommentId;
exports.isValidCommentId = isValidCommentId;
exports.createNewDiscussion = createNewDiscussion;
exports.addCommentToDiscussion = addCommentToDiscussion;
exports.matchesMention = matchesMention;
exports.extractMentions = extractMentions;
exports.hasMentionFor = hasMentionFor;
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
 * Generate a unique comment ID
 * Format: c-XXXXXXXX (c- prefix + 8 lowercase hex characters)
 */
function generateCommentId() {
    const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `c-${hex}`;
}
/**
 * Validate a comment ID format
 */
function isValidCommentId(id) {
    return /^c-[a-f0-9]{8}$/.test(id);
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
            id: generateCommentId(),
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
    const newComment = {
        id: generateCommentId(),
        author,
        created_at: new Date().toISOString(),
        body: body.trim(),
    };
    return {
        ...discussion,
        comments: [...discussion.comments, newComment],
    };
}
// ============================================================================
// Mention Utilities
// ============================================================================
/**
 * Check if a mention matches an author name using fuzzy matching.
 * The characters in the mention must appear in the same order in the author name.
 * Case-insensitive.
 *
 * Examples:
 * - @andre matches "Andre Schuster", "Andreas", "Alexander Andre"
 * - @janMat matches "JanMeierMattis", "Jan Mattis"
 */
function matchesMention(mention, authorName) {
    // Remove @ prefix if present
    const cleanMention = mention.startsWith('@') ? mention.slice(1) : mention;
    if (!cleanMention || !authorName) {
        return false;
    }
    // Remove spaces from author name for matching
    const normalizedAuthor = authorName.replace(/\s+/g, '').toLowerCase();
    const normalizedMention = cleanMention.toLowerCase();
    // Check if all characters in mention appear in order in author name
    let authorIndex = 0;
    for (const char of normalizedMention) {
        const foundIndex = normalizedAuthor.indexOf(char, authorIndex);
        if (foundIndex === -1) {
            return false;
        }
        authorIndex = foundIndex + 1;
    }
    return true;
}
/**
 * Extract all mentions from a comment body.
 * Returns the mention strings without the @ prefix.
 */
function extractMentions(body) {
    const regex = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;
    const mentions = [];
    let match;
    while ((match = regex.exec(body)) !== null) {
        mentions.push(match[1]);
    }
    return [...new Set(mentions)]; // Remove duplicates
}
/**
 * Check if a comment body has a mention for a specific author.
 */
function hasMentionFor(body, authorName) {
    const mentions = extractMentions(body);
    return mentions.some(mention => matchesMention(mention, authorName));
}
//# sourceMappingURL=discussion.js.map