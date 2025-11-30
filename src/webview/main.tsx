import { h, render } from 'preact';
import { App } from './components/App';
import './styles/main.css';

// Acquire VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Handle link clicks - open in external browser
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.href) {
        e.preventDefault();
        vscode.postMessage({ type: 'openLink', url: anchor.href });
    }
});

// Render the app
render(<App vscode={vscode} />, document.getElementById('root')!);
