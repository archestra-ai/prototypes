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
      '@clients': path.resolve(__dirname, './src/clients'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  build: {
    rollupOptions: {
      external: ['@ai-sdk/openai', 'ai', 'better-sqlite3', 'cors', 'dotenv', 'express', 'ollama-ai-provider'],
    },
  },
  test: {
    silent: true, // suppress all console logs from the tests
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          setupFiles: ['./src/ui/setup-tests.ts'],
          include: ['src/ui/**/*.test.{ts,tsx}'],
          name: {
            label: 'browser',
            color: 'yellow',
          },
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          setupFiles: ['./src/backend/setup-tests.ts'],
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
