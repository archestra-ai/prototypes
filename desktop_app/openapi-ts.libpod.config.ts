import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'https://storage.googleapis.com/libpod-master-releases/swagger-latest.yaml',
  output: {
    path: 'src/backend/lib/clients/libpod/gen',
    clean: true,
    format: 'prettier',
    indexFile: true,
    tsConfigPath: 'tsconfig.json',
  },
  /**
   * See here for why we need this, basically to configure the baseUrl of the API
   * https://heyapi.dev/openapi-ts/clients/fetch#runtime-api
   */
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/backend/lib/clients/libpod/client.ts',
    },
  ],
});
