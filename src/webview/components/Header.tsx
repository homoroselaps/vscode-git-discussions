import { h } from 'preact';
import { Discussion } from '../types';

interface HeaderProps {
    discussion: Discussion;
    onCopyId: () => void;
    onOpenContext: () => void;
    onCloseDiscussion: () => void;
}

export function Header({ discussion, onCopyId, onOpenContext, onCloseDiscussion }: HeaderProps) {
    const { title, status, anchor } = discussion;

    return (
        <div className="header">
            <h2>{title}</h2>
            <div className="sub-header">
                <div className="meta">
                    <span className={`status ${status}`}>{status}</span>
                    <span className="location">{anchor.file_path}:{anchor.start_line}</span>
                </div>
                <div className="icon-actions">
                    <button
                        className="icon-button"
                        onClick={onCopyId}
                        title="Copy discussion ID"
                    >
                        <span className="codicon codicon-copy" />
                    </button>
                    <button
                        className="icon-button"
                        onClick={onOpenContext}
                        title="Open context"
                    >
                        <span className="codicon codicon-go-to-file" />
                    </button>
                    {status !== 'closed' && (
                        <button
                            className="icon-button"
                            onClick={onCloseDiscussion}
                            title="Close discussion"
                        >
                            <span className="codicon codicon-check" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
