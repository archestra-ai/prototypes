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
      /**
       * NOTE: don't name this @types, see here for why
       * https://stackoverflow.com/a/77502938
       */
      '@archestra/types': path.resolve(__dirname, './src/types'),
      '@archestra/schemas': path.resolve(__dirname, './src/schemas'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
});
