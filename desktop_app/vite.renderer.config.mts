import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, './src/backend'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
  server: {
    proxy: {
      /**
       * Proxy all API requests to the backend server
       *
       * https://vite.dev/config/server-options.html#server-proxy
       */
      '^/(api|mcp_proxy|llm|mcp).*': {
        target: 'http://localhost:54587',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:54588',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
