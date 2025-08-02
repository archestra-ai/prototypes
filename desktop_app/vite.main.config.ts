/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './src/backend'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
  build: {
    rollupOptions: {
      external: ['@ai-sdk/openai', 'ai', 'better-sqlite3', 'cors', 'dotenv', 'express', 'ollama-ai-provider'],
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: './setup-tests.ts',
    projects: [
      {
        extends: true,
        test: {
          include: ['src/ui/**/*.test.{ts,tsx}'],
          name: {
            label: 'browser',
            color: 'cyan',
          },
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          include: ['src/backend/**/*test.{ts,tsx}'],
          name: {
            label: 'node',
            color: 'green',
          },
          environment: 'node',
        },
      },
    ],
  },
});
