/**
 * This file configures the libpod API client with the unix socket path
 * See here:
 * https://github.com/nodejs/undici?tab=readme-ov-file#undici-module
 */
import { Agent, fetch, setGlobalDispatcher } from 'undici';

import type { CreateClientConfig } from './gen/client.gen';

setGlobalDispatcher(
  new Agent({
    connect: {
      socketPath: '/var/run/docker.sock',
    },
  })
);

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  /**
   * this is a workaround to get the client to work with the unix socket path (using undici's fetch)
   * https://heyapi.dev/openapi-ts/clients/fetch#custom-fetch
   */
  fetch: fetch as unknown as (request: Request) => Promise<Response>,
  baseUrl: 'http://d/v5.0.0/libpod',
});
