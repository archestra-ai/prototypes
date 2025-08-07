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
      '@clients': path.resolve(__dirname, './src/clients'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
});
