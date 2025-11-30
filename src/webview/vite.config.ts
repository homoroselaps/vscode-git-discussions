import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
    plugins: [preact()],
    build: {
        outDir: resolve(__dirname, '../../out/webview'),
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: resolve(__dirname, 'main.tsx'),
            output: {
                entryFileNames: 'webview.js',
                assetFileNames: 'webview.[ext]',
                format: 'iife',
            },
        },
        minify: 'esbuild',
        sourcemap: true,
    },
    css: {
        // Extract CSS to separate file
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
});
