/// <reference types="vitest" />
import { defineConfig as defineVitestConfig } from 'vitest/config';

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setup-tests.ts',
  },
});
