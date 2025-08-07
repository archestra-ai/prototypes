/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, './src/backend'),
      '@clients': path.resolve(__dirname, './src/clients'),
      /**
       * NOTE: don't name this @types, see here for why
       * https://stackoverflow.com/a/77502938
       */
      '@archestra/types': path.resolve(__dirname, './src/types'),
      '@archestra/schemas': path.resolve(__dirname, './src/schemas'),
      '@ui': path.resolve(__dirname, './src/ui'),
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
