/**
 * Utility functions for handling @mentions
 */

/**
 * Check if a mention matches an author name using fuzzy matching.
 * Characters in mention must appear in order in author name (case-insensitive).
 */
export function matchesMention(mention: string, authorName: string): boolean {
    const cleanMention = mention.replace(/^@/, '').toLowerCase();
    const normalizedAuthor = authorName.replace(/\s+/g, '').toLowerCase();

    if (!cleanMention || !normalizedAuthor) return false;

    let authorIndex = 0;
    for (const char of cleanMention) {
        const foundIndex = normalizedAuthor.indexOf(char, authorIndex);
        if (foundIndex === -1) return false;
        authorIndex = foundIndex + 1;
    }
    return true;
}

/**
 * Escape HTML characters to prevent XSS
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format mentions in comment body with styling
 */
export function formatMentions(text: string): string {
    // First escape HTML
    let escaped = escapeHtml(text);

    // Replace @mentions with highlighted style
    escaped = escaped.replace(/@([a-zA-Z][a-zA-Z0-9_-]*)/g, '<span class="mention">@$1</span>');

    return escaped;
}
