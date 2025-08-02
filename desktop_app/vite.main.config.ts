import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: ['@ai-sdk/openai', 'ai', 'better-sqlite3', 'cors', 'dotenv', 'express', 'ollama-ai-provider'],
    },
  },
});
