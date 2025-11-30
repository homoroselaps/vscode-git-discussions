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

// Render the app
render(<App vscode={vscode} />, document.getElementById('root')!);
