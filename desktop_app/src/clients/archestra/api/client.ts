import type { CreateClientConfig } from './gen/client.gen';

/**
 * TODO: don't hardcode this, pull this from environment variables
 */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: 'http://localhost:54587',
});
