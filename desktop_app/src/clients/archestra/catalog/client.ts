import type { CreateClientConfig } from './gen/client.gen';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  catalogUrl: 'https://www.archestra.ai/mcp-catalog/api',
  baseUrl: 'http://localhost:3000/mcp-catalog/api',
});
