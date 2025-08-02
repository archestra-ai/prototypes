import { spawn } from 'child_process';

import OllamaServer from '.';

vi.mock('child_process');
vi.mock('net');
vi.mock('electron');
vi.mock('@backend/lib/utils/binaries', () => ({
  getBinaryExecPath: vi.fn((binaryName: string) => `/mock/path/${binaryName}`),
  getPlatform: vi.fn(() => 'mock-platform'),
  getArchitecture: vi.fn(() => 'mock-architecture'),
}));

// Test helper
function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.stubEnv('HOME', '/mock/home');

// Mock spawn to return a mock process
const mockProcess = {
  stdout: {
    on: vi.fn(),
    listenerCount: vi.fn(() => 1),
  },
  stderr: {
    on: vi.fn(),
    listenerCount: vi.fn(() => 1),
  },
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  kill: vi.fn(),
};

describe('OllamaServer', () => {
  let server: OllamaServer;
  let originalResourcesPath: string;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset mock process state
    mockProcess.on.mockClear();
    mockProcess.once.mockClear();
    mockProcess.kill.mockClear();
    mockProcess.stdout.on.mockClear();
    mockProcess.stderr.on.mockClear();

    // Setup spawn mock
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    // Store the original value to restore it later
    originalResourcesPath = process.resourcesPath;
    // Mock process.resourcesPath to a desired path for testing
    Object.defineProperty(process, 'resourcesPath', {
      value: '/mock/path/to/resources',
      configurable: true,
    });

    // Create server instance
    server = new OllamaServer();
  });

  afterEach(() => {
    // Clean up
    vi.restoreAllMocks();

    // Restore original process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
    });
  });

  describe('startServer', () => {
    it('should start the server successfully with correct arguments', async () => {
      await server.startServer();

      expect(spawn).toHaveBeenCalledWith('/mock/path/ollama-v0.9.6', ['serve'], {
        env: {
          HOME: '/mock/home',
          OLLAMA_HOST: '127.0.0.1:12345',
          OLLAMA_ORIGINS: 'http://localhost:54587',
          OLLAMA_DEBUG: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    });

    it('should not start if already running', async () => {
      await server.startServer();

      const initialCallCount = vi.mocked(spawn).mock.calls.length;

      await server.startServer();

      expect(vi.mocked(spawn).mock.calls.length).toBe(initialCallCount);
    });

    it('should handle port allocation failure', async () => {
      const net = await import('net');
      vi.mocked(net.createServer).mockImplementationOnce(() => {
        throw new Error('Failed to create server');
      });

      await expect(server.startServer()).rejects.toThrow();
    });

    it('should capture stdout and stderr', async () => {
      await server.startServer();

      // Verify that listeners are attached
      expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('stopServer', () => {
    it('should stop the server gracefully', async () => {
      await server.startServer();

      // Setup the exit listener
      mockProcess.once.mockImplementationOnce((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(), 10);
        }
      });

      // Stop the server
      const stopPromise = server.stopServer();

      await stopPromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should do nothing if server is not running', async () => {
      await server.stopServer();

      expect(spawn).not.toHaveBeenCalled();
    });

    it('should handle force kill after timeout', async () => {
      await server.startServer();

      // Setup the exit listener to not fire immediately
      mockProcess.once.mockImplementationOnce((event, callback) => {
        if (event === 'exit') {
          // Don't call the callback immediately, wait for force kill
          setTimeout(() => callback(), 7000);
        }
      });

      // Start stopping
      const stopPromise = server.stopServer();

      // Wait for timeout
      await waitFor(6000);

      // Should have tried SIGKILL
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');

      await stopPromise;
    }, 10000);

    it('should handle process exit with error code', async () => {
      await server.startServer();

      // Simulate process crash by calling the exit handler
      const exitHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'exit')?.[1];
      if (exitHandler) {
        exitHandler(1, null);
      }

      // Wait a bit for internal state to update
      await waitFor(100);

      // Try to start again - should work since process exited
      await expect(server.startServer()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle spawn errors', async () => {
      vi.mocked(spawn).mockImplementationOnce(() => {
        throw new Error('Failed to spawn process');
      });

      await expect(server.startServer()).rejects.toThrow('Failed to spawn process');
    });

    it('should handle process spawn ENOENT error', async () => {
      vi.mocked(spawn).mockImplementationOnce(() => {
        const error = new Error('spawn ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });

      await expect(server.startServer()).rejects.toThrow('ENOENT');
    });

    it('should emit error events from process', async () => {
      await server.startServer();

      // Verify error handler was attached
      const errorHandlerCalls = mockProcess.on.mock.calls.filter((call) => call[0] === 'error');
      expect(errorHandlerCalls.length).toBeGreaterThan(0);

      // Simulate error
      const errorHandler = errorHandlerCalls[0][1];
      const testError = new Error('Process error');
      errorHandler(testError);
    });
  });
});
