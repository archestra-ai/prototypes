import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      /**
       * See these following resources for more information:
       * https://github.com/WiseLibs/better-sqlite3/issues/126#issuecomment-2365187024
       * https://stackoverflow.com/a/79443950
       */
      external: [
        '@ai-sdk/openai',
        'ai',
        'better-sqlite3',
        'cors',
        'dotenv',
        'express',
        'ollama-ai-provider',
      ],
    },
  },
});
