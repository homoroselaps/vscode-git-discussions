import { h } from 'preact';
import { Comment as CommentType } from '../types';
import { Comment } from './Comment';
import { useEffect, useRef } from 'preact/hooks';

interface CommentListProps {
    comments: CommentType[];
    currentUserName: string;
    readCommentIds: string[];
    onMarkCommentRead: (commentId: string) => void;
    onMarkAllRead: () => void;
}

export function CommentList({
    comments,
    currentUserName,
    readCommentIds,
    onMarkCommentRead,
    onMarkAllRead,
}: CommentListProps) {
    const commentsRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when comments change
    useEffect(() => {
        if (commentsRef.current) {
            commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
        }
    }, [comments]);

    if (comments.length === 0) {
        return (
            <div className="comments">
                <div className="no-comments">No comments yet. Start the conversation!</div>
            </div>
        );
    }

    return (
        <div className="comments" ref={commentsRef}>
            {comments.map((comment) => (
                <Comment
                    key={comment.id}
                    comment={comment}
                    currentUserName={currentUserName}
                    readCommentIds={readCommentIds}
                    onMarkRead={onMarkCommentRead}
                />
            ))}
        </div>
    );
}
