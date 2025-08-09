import commonConfig from '@commonConfig';

import type { CreateClientConfig } from './gen/client.gen';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: commonConfig.archestra.catalogUrl,
});
