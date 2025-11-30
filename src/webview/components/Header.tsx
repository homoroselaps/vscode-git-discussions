import { h } from 'preact';
import { Discussion } from '../types';

interface HeaderProps {
    discussion: Discussion;
    onGoToAnchor: () => void;
    onCloseDiscussion: () => void;
}

export function Header({ discussion, onGoToAnchor, onCloseDiscussion }: HeaderProps) {
    const { title, status, anchor, isAnchored } = discussion;

    return (
        <div className="header">
            <h2>{title}</h2>
            <div className="meta">
                <span className={`status ${status}`}>{status}</span>
                <span> • {anchor.file_path}:{anchor.start_line}</span>
            </div>
            <div className="actions">
                {isAnchored && (
                    <button onClick={onGoToAnchor} title="Go to anchor in code">
                        📍 Go to Code
                    </button>
                )}
                {status !== 'closed' && (
                    <button onClick={onCloseDiscussion} title="Close this discussion">
                        ✓ Close
                    </button>
                )}
            </div>
        </div>
    );
}
