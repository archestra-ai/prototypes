import { describe, expect, it, vi } from 'vitest';

import OllamaServer from '.';

vi.mock('child_process');
vi.mock('@backend/lib/utils/binaries', () => ({
  getBinaryExecPath: vi.fn((binaryName: string) => `/mock/path/${binaryName}`),
  default: vi.fn().mockImplementation(function (
    processName: string,
    binaryName: string,
    commandArgs: string[],
    commandEnv: NodeJS.ProcessEnv
  ) {
    this.PROCESS_NAME = processName;
    this.BINARY_NAME = binaryName;
    this.COMMAND_ARGS = commandArgs;
    this.COMMAND_ENV = commandEnv;
    this.startProcess = vi.fn();
    this.stopProcess = vi.fn();
  }),
}));

describe('OllamaServer', () => {
  it('should initialize with correct parameters for Ollama', () => {
    const port = 12345;
    const server = new OllamaServer(port);

    // Verify it was constructed with the right parameters
    expect(server).toBeDefined();
    expect((server as any).PROCESS_NAME).toBe('Ollama server');
    expect((server as any).BINARY_NAME).toBe('ollama-v0.9.6');
    expect((server as any).COMMAND_ARGS).toEqual(['serve']);
    expect((server as any).COMMAND_ENV).toEqual({
      HOME: process.env.HOME,
      OLLAMA_HOST: `127.0.0.1:${port}`,
      OLLAMA_ORIGINS: 'http://localhost:54587',
      OLLAMA_DEBUG: '0',
    });
  });
});
