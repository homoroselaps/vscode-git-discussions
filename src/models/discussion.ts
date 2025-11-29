/**
 * Data models for Long-Lived Git Discussions
 * 
 * These interfaces match the YAML schema defined in the user story.
 */

/**
 * Discussion status
 */
export type DiscussionStatus = 'open' | 'closed';

/**
 * A comment within a discussion
 */
export interface Comment {
    /** Unique ID in format c-XXXXXXXX (8 hex chars) */
    id: string;
    /** Author username or identifier (optional for legacy/imported comments) */
    author?: string;
    /** ISO 8601 timestamp (optional for legacy/imported comments) */
    created_at?: string;
    /** The comment text (multi-line supported) */
    body: string;
}

/**
 * Anchor information - where the discussion is attached in code
 */
export interface Anchor {
    /** Git commit SHA at time of creation */
    commit_sha: string;
    /** Relative file path from workspace root */
    file_path: string;
    /** Start line of the anchored code (1-based) */
    start_line: number;
    /** End line of the anchored code (1-based, inclusive) */
    end_line: number;
    /** VS Code language ID */
    language: string;
    /** Optional symbol path (e.g., "Foo.handleNegative") */
    symbol_path: string | null;
    /** Line number where the [discussion:id] comment is (1-based) */
    anchor_line: number;
}

/**
 * Discussion metadata
 */
export interface DiscussionMetadata {
    /** Username who created the discussion */
    created_by: string;
    /** ISO 8601 timestamp */
    created_at: string;
}

/**
 * A full discussion as stored in YAML
 */
export interface Discussion {
    /** Unique ID in format d-XXXXXXXX (8 hex chars) */
    id: string;
    /** Human-readable title */
    title: string;
    /** Current status */
    status: DiscussionStatus;
    /** Optional: Git remote URL of the code repo */
    code_repo?: string;
    /** Anchor information */
    anchor: Anchor;
    /** Creation metadata */
    metadata: DiscussionMetadata;
    /** List of comments */
    comments: Comment[];
}

/**
 * Discussion metadata without comments - stored in _meta.yml
 */
export interface DiscussionMeta {
    /** Unique ID in format d-XXXXXXXX (8 hex chars) */
    id: string;
    /** Human-readable title */
    title: string;
    /** Current status */
    status: DiscussionStatus;
    /** Optional: Git remote URL of the code repo */
    code_repo?: string;
    /** Anchor information */
    anchor: Anchor;
    /** Creation metadata */
    metadata: DiscussionMetadata;
}

/**
 * Anchor location found by scanning code files
 */
export interface AnchorLocation {
    /** The discussion ID */
    id: string;
    /** Absolute file path */
    filePath: string;
    /** Relative file path from workspace root */
    relativePath: string;
    /** Line number where anchor was found (1-based) */
    line: number;
    /** VS Code language ID of the file */
    languageId: string;
}

/**
 * Discussion with its current anchor status
 */
export interface DiscussionWithAnchorStatus extends Discussion {
    /** Current anchor location in code (null if anchor is missing) */
    currentAnchor: AnchorLocation | null;
    /** Whether the anchor exists in code */
    isAnchored: boolean;
}

/**
 * Comment prefix mapping for different languages
 */
export const COMMENT_PREFIXES: Record<string, string> = {
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
export function getCommentPrefix(languageId: string): string {
    return COMMENT_PREFIXES[languageId] || '//';
}

/**
 * Generate a discussion anchor comment for a given language and ID
 */
export function formatAnchorComment(languageId: string, discussionId: string): string {
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
export function generateDiscussionId(): string {
    const hex = Array.from({ length: 8 }, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `d-${hex}`;
}

/**
 * Validate a discussion ID format
 */
export function isValidDiscussionId(id: string): boolean {
    return /^d-[a-f0-9]{8}$/.test(id);
}

/**
 * Generate a unique comment ID
 * Format: c-XXXXXXXX (c- prefix + 8 lowercase hex characters)
 */
export function generateCommentId(): string {
    const hex = Array.from({ length: 8 }, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `c-${hex}`;
}

/**
 * Validate a comment ID format
 */
export function isValidCommentId(id: string): boolean {
    return /^c-[a-f0-9]{8}$/.test(id);
}

/**
 * Format a date as a compact timestamp for filenames
 * Format: YYYYMMDDTHHmmssZ (e.g., 20251129T100530Z)
 * - Sorts chronologically in file explorers
 * - Human-readable at a glance
 * - No special characters that need escaping
 */
export function formatCompactTimestamp(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generate a comment filename with timestamp prefix
 * Format: YYYYMMDDTHHmmssZ_c-XXXXXXXX.yml
 */
export function generateCommentFilename(commentId: string, createdAt?: string): string {
    const date = createdAt ? new Date(createdAt) : new Date();
    const timestamp = formatCompactTimestamp(date);
    return `${timestamp}_${commentId}.yml`;
}

/**
 * Parse a comment filename to extract the comment ID
 * Returns null if the filename doesn't match the expected pattern
 */
export function parseCommentFilename(filename: string): { timestamp: string; commentId: string } | null {
    // Match: YYYYMMDDTHHmmssZ_c-XXXXXXXX.yml
    const match = filename.match(/^(\d{8}T\d{6}Z)_(c-[a-f0-9]{8})\.yml$/);
    if (!match) {
        return null;
    }
    return {
        timestamp: match[1],
        commentId: match[2],
    };
}

/**
 * Create a new discussion with default values
 */
export function createNewDiscussion(
    id: string,
    title: string,
    anchor: Anchor,
    author: string,
    initialComment?: string
): Discussion {
    const now = new Date().toISOString();
    
    const discussion: Discussion = {
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
export function addCommentToDiscussion(
    discussion: Discussion,
    author: string,
    body: string
): Discussion {
    const newComment: Comment = {
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
export function matchesMention(mention: string, authorName: string): boolean {
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
export function extractMentions(body: string): string[] {
    const regex = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;
    const mentions: string[] = [];
    let match;

    while ((match = regex.exec(body)) !== null) {
        mentions.push(match[1]);
    }

    return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Check if a comment body has a mention for a specific author.
 */
export function hasMentionFor(body: string, authorName: string): boolean {
    const mentions = extractMentions(body);
    return mentions.some(mention => matchesMention(mention, authorName));
}
