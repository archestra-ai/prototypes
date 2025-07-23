import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'openapi.json',
  output: {
    path: 'src/lib/api',
    clean: true,
    format: 'prettier',
    indexFile: true,
    tsConfigPath: 'tsconfig.json',
  },
});
