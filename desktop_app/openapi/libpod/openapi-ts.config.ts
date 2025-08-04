import { defineConfig } from '@hey-api/openapi-ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  input: 'https://storage.googleapis.com/libpod-master-releases/swagger-latest.yaml',
  output: {
    path: path.join(__dirname, '../../src/clients/libpod/gen'),
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
      runtimeConfigPath: '../../src/clients/libpod/client.ts',
    },
  ],
});
