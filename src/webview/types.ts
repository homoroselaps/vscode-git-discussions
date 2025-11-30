/**
 * Types for the webview
 */

export interface Comment {
    id: string;
    author?: string;
    created_at?: string;
    body: string;
}

export interface Anchor {
    commit_sha: string;
    file_path: string;
    start_line: number;
    end_line: number;
    language: string;
    symbol_path: string | null;
    anchor_line: number;
}

export interface AnchorLocation {
    id: string;
    filePath: string;
    relativePath: string;
    line: number;
    languageId: string;
}

export interface Discussion {
    id: string;
    title: string;
    status: 'open' | 'closed';
    code_repo?: string;
    anchor: Anchor;
    metadata: {
        created_by: string;
        created_at: string;
    };
    comments: Comment[];
    currentAnchor: AnchorLocation | null;
    isAnchored: boolean;
}

export interface VSCodeAPI {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

export interface WebviewMessage {
    type: string;
    discussion?: Discussion | null;
    currentUserName?: string;
    readCommentIds?: string[];
}
