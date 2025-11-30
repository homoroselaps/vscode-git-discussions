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
 * Format mentions and links in comment body with styling
 */
export function formatMentions(text: string): string {
    // First escape HTML
    let escaped = escapeHtml(text);

    // URL regex pattern - matches http, https, and www URLs
    const urlPattern = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;
    
    // Replace URLs with anchor tags first (before mentions, to avoid conflicts)
    escaped = escaped.replace(urlPattern, (url) => {
        // Add protocol if missing (for www. URLs)
        const href = url.startsWith('www.') ? `https://${url}` : url;
        // Truncate display text if too long
        const displayText = url.length > 50 ? url.substring(0, 47) + '...' : url;
        return `<a href="${href}" class="link" title="${url}">${displayText}</a>`;
    });

    // Replace @mentions with highlighted style
    escaped = escaped.replace(/@([a-zA-Z][a-zA-Z0-9_-]*)/g, '<span class="mention">@$1</span>');

    return escaped;
}
