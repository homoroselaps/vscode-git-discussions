import { h } from 'preact';

export function EmptyState() {
    return (
        <div className="empty-state">
            <div className="icon">💬</div>
            <p>Select a discussion from the tree above to view comments and add replies.</p>
        </div>
    );
}
