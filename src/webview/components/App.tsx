import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Discussion, VSCodeAPI, WebviewMessage } from '../types';
import { Header } from './Header';
import { CommentList } from './CommentList';
import { InputArea } from './InputArea';
import { EmptyState } from './EmptyState';

interface AppProps {
    vscode: VSCodeAPI;
}

export function App({ vscode }: AppProps) {
    const [discussion, setDiscussion] = useState<Discussion | null>(null);
    const [currentUserName, setCurrentUserName] = useState('');
    const [readCommentIds, setReadCommentIds] = useState<string[]>([]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent<WebviewMessage>) => {
            const message = event.data;
            if (message.type === 'updateDiscussion') {
                setDiscussion(message.discussion || null);
                setCurrentUserName(message.currentUserName || '');
                setReadCommentIds(message.readCommentIds || []);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleAddComment = (text: string) => {
        vscode.postMessage({ type: 'addComment', text });
    };

    const handleGoToAnchor = () => {
        vscode.postMessage({ type: 'goToAnchor' });
    };

    const handleCloseDiscussion = () => {
        vscode.postMessage({ type: 'closeDiscussion' });
    };

    const handleMarkCommentRead = (commentId: string) => {
        vscode.postMessage({ type: 'markCommentMentionRead', commentId });
    };

    const handleMarkAllRead = () => {
        vscode.postMessage({ type: 'markAllMentionsRead' });
    };

    if (!discussion) {
        return <EmptyState />;
    }

    return (
        <div className="container">
            <Header
                discussion={discussion}
                onGoToAnchor={handleGoToAnchor}
                onCloseDiscussion={handleCloseDiscussion}
            />
            <CommentList
                comments={discussion.comments}
                currentUserName={currentUserName}
                readCommentIds={readCommentIds}
                onMarkCommentRead={handleMarkCommentRead}
                onMarkAllRead={handleMarkAllRead}
            />
            <InputArea
                disabled={discussion.status === 'closed'}
                onSubmit={handleAddComment}
            />
        </div>
    );
}
