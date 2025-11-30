import { h } from 'preact';
import { useState } from 'preact/hooks';

interface InputAreaProps {
    disabled: boolean;
    onSubmit: (text: string) => void;
}

export function InputArea({ disabled, onSubmit }: InputAreaProps) {
    const [text, setText] = useState('');

    const handleSubmit = () => {
        const trimmed = text.trim();
        if (trimmed) {
            onSubmit(trimmed);
            setText('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSubmit();
        }
    };

    return (
        <div className="input-area">
            <textarea
                value={text}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={disabled ? 'Discussion is closed' : 'Write a comment... (use @name to mention)'}
                rows={3}
            />
            <button onClick={handleSubmit} disabled={disabled || !text.trim()}>
                Add Comment
            </button>
        </div>
    );
}
