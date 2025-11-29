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
    /** Incrementing integer ID within the discussion */
    id: number;
    /** Author username or identifier */
    author: string;
    /** ISO 8601 timestamp */
    created_at: string;
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
    /** Optional: Git remote URL of the discussions repo */
    discussion_repo?: string;
    /** Anchor information */
    anchor: Anchor;
    /** Creation metadata */
    metadata: DiscussionMetadata;
    /** List of comments */
    comments: Comment[];
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
export function addCommentToDiscussion(
    discussion: Discussion,
    author: string,
    body: string
): Discussion {
    const maxId = discussion.comments.reduce((max, c) => Math.max(max, c.id), 0);
    const newComment: Comment = {
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
