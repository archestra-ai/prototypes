import { defineConfig } from '@hey-api/openapi-ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  input: 'https://www.archestra.ai/mcp-catalog/api/docs',
  output: {
    path: path.join(__dirname, '../../../src/clients/archestra/catalog/gen'),
    clean: true,
    format: 'prettier',
    indexFile: true,
    tsConfigPath: path.join(__dirname, '../../../tsconfig.json'),
  },
  /**
   * See here for why we need this, basically to configure the baseUrl of the API
   * https://heyapi.dev/openapi-ts/clients/fetch#runtime-api
   *
   * The runtimeConfigPath should be relative to the output directory, NOT the config file
   */
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: '../client.ts',
    },
  ],
});
