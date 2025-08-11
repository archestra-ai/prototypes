import { defineConfig } from '@hey-api/openapi-ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  /**
   * NOTE: if we bump the version of the Podman binary that we bundle with the app, we should also bump
   * the swagger version here, such that we're guaranteed to have the correct API schema for the version
   * of Podman that we're using.
   */
  input: 'https://storage.googleapis.com/libpod-master-releases/swagger-v5.5.2.yaml',
  output: {
    path: path.join(__dirname, '../../src/backend/clients/libpod/gen'),
    clean: true,
    format: 'prettier',
    indexFile: true,
    tsConfigPath: path.join(__dirname, '../../tsconfig.json'),
  },
  /**
   * See here for why we need this, basically to configure the baseUrl of the API
   * https://heyapi.dev/openapi-ts/clients/fetch#runtime-api
   *
   * NOTE: DON'T use an absolute path here, won't work
   */
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: '../../src/backend/clients/libpod/client.ts',
    },
  ],
});
