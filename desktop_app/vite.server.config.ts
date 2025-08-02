import { defineConfig } from 'vite';
import path from 'path';

/**
 * Vite configuration for the server process build
 * 
 * This config is used to build src/server-process.ts into a standalone
 * JavaScript file that can be executed by Node.js (not Electron)
 */
export default defineConfig({
  resolve: {
    alias: {
      // Allow @/ imports in server code to match the rest of the codebase
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './src/backend'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
  build: {
    rollupOptions: {
      // CRITICAL: Mark better-sqlite3 as external to prevent bundling
      // Native Node.js modules (.node files) cannot be bundled by Rollup/Vite
      // This tells Vite to leave `require('better-sqlite3')` as-is in the output
      // Also mark UI components as external since server doesn't need them
      external: [
        'better-sqlite3',
      ],
    },
  },
  optimizeDeps: {
    // Also exclude from dependency optimization
    // This prevents Vite from trying to pre-bundle better-sqlite3
    exclude: ['better-sqlite3'],
  },
});