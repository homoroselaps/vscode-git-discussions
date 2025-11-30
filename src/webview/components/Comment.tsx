import { h } from 'preact';
import { Comment as CommentType } from '../types';
import { matchesMention, formatMentions } from '../utils/mentions';

interface CommentProps {
    comment: CommentType;
    currentUserName: string;
    readCommentIds: string[];
    onMarkRead: (commentId: string) => void;
}

export function Comment({ comment, currentUserName, readCommentIds, onMarkRead }: CommentProps) {
    const author = comment.author || 'Unknown';
    
    let timeStr = '';
    if (comment.created_at) {
        const date = new Date(comment.created_at);
        timeStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    const hasUnreadMention = hasUnreadMentionForUser(comment, currentUserName, readCommentIds);
    const mentionClass = hasUnreadMention ? 'has-mention' : '';

    const handleBellClick = (e: MouseEvent) => {
        e.stopPropagation();
        onMarkRead(comment.id);
    };

    return (
        <div className={`comment ${mentionClass}`}>
            <div className="comment-header">
                <span className="author">
                    {author}
                    {hasUnreadMention && (
                        <span
                            className="mention-bell"
                            onClick={handleBellClick}
                            title="Click to mark mention as read"
                        >
                            🔔
                        </span>
                    )}
                </span>
                <span className="time">{timeStr}</span>
            </div>
            <div
                className="body"
                dangerouslySetInnerHTML={{ __html: formatMentions(comment.body) }}
            />
        </div>
    );
}

/**
 * Check if comment has unread mention for current user
 */
function hasUnreadMentionForUser(
    comment: CommentType,
    currentUserName: string,
    readCommentIds: string[]
): boolean {
    if (!currentUserName) return false;
    if (readCommentIds.includes(comment.id)) return false;

    const regex = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let match;
    while ((match = regex.exec(comment.body)) !== null) {
        if (matchesMention(match[1], currentUserName)) {
            return true;
        }
    }
    return false;
}
