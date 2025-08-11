import config from '@ui/config';

import type { CreateClientConfig } from './gen/client.gen';

export const createClientConfig: CreateClientConfig = (clientConfig) => ({
  ...clientConfig,
  baseUrl: config.archestra.catalogUrl,
});
