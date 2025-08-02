/**
 * This file configures the API client with the gateway base URL
 * This file is NOT generated and will not be overwritten by codegen
 */
import { ARCHESTRA_GATEWAY_SERVER_BASE_URL } from '@/consts';

import type { CreateClientConfig } from './api/client.gen';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: ARCHESTRA_GATEWAY_SERVER_BASE_URL,
});
