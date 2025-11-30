import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

interface InputAreaProps {
    disabled: boolean;
    onSubmit: (text: string) => void;
}

export function InputArea({ disabled, onSubmit }: InputAreaProps) {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = () => {
        const trimmed = text.trim();
        if (trimmed) {
            onSubmit(trimmed);
            setText('');
            // Reset textarea height after submit
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSubmit();
        }
    };

    const handleInput = (e: Event) => {
        const textarea = e.target as HTMLTextAreaElement;
        setText(textarea.value);
        
        // Auto-expand: reset height then set to scrollHeight
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    };

    return (
        <div className="input-area">
            <div className="input-wrapper">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? 'Discussion is closed' : 'Write a comment... (Ctrl+Enter to send)'}
                    rows={1}
                />
                <button
                    className="send-button"
                    onClick={handleSubmit}
                    disabled={disabled || !text.trim()}
                    title="Send comment (Ctrl+Enter)"
                >
                    <span className="codicon codicon-send" />
                </button>
            </div>
        </div>
    );
}
