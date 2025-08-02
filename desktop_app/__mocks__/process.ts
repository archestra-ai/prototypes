// import { vi } from 'vitest';

// export const platform = vi.fn(() => );
// export const arch = vi.fn(() => 'arm64');
// export const resourcesPath = vi.fn(() => '/test/resources/path');
// export const env = vi.fn(() => ({
//   OLLAMA_HOST: '127.0.0.1:12345',
//   OLLAMA_ORIGINS: 'http://localhost:54587',
// }));

export default {
  platform: 'darwin',
  arch: 'arm64',
  resourcesPath: '/test/resources/path',
  env: {
    OLLAMA_HOST: '127.0.0.1:12345',
    OLLAMA_ORIGINS: 'http://localhost:54587',
  },
};
