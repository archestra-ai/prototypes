import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
});
