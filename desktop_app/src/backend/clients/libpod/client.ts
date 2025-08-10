/**
 * This file configures the libpod API client with the unix socket path
 * See here:
 * https://github.com/nodejs/undici?tab=readme-ov-file#undici-module
 */
import { Agent, fetch, setGlobalDispatcher } from 'undici';

import config from '@backend/config';

import type { CreateClientConfig } from './gen/client.gen';

/**
 * Update the socket path used by the libpod client.
 * This is needed to avoid conflicts with Docker/Orbstack.
 *
 * NOTE: this NEEDS to be called, before the libpod client is properly initialized/ready to use.
 */
export function setSocketPath(socketPath: string): void {
  console.log(`Setting libpod socket path to: ${socketPath}`);
  setGlobalDispatcher(new Agent({ connect: { socketPath } }));
}

export const createClientConfig: CreateClientConfig = (clientConfig) => ({
  ...clientConfig,
  /**
   * this is a workaround to get the client to work with the unix socket path (using undici's fetch)
   * https://heyapi.dev/openapi-ts/clients/fetch#custom-fetch
   */
  fetch: async (request: Request) => {
    // Extract URL and options from the Request object
    const url = request.url;
    const options: any = {
      method: request.method,
      headers: request.headers,
      body: request.body,
    };

    // Add duplex option when body is present (required for streams)
    if (request.body) {
      options.duplex = 'half';
    }

    return fetch(url, options) as unknown as Promise<Response>;
  },
  baseUrl: config.sandbox.podman.baseUrl,
});
