import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'express',
        'cors', 
        '@ai-sdk/openai',
        'ollama-ai-provider',
        'ai',
        'dotenv'
      ]
    }
  }
});