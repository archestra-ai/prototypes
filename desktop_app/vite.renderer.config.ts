import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      }
    }
  }
});
