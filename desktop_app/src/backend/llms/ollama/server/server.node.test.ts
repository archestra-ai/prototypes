import { spawn } from 'child_process';
import { app } from 'electron';

import OllamaServer from '.';

vi.mock('child_process');
vi.mock('net');
vi.mock('electron');

// Test helper
function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('OllamaServer', () => {
  let server: OllamaServer;
  let mockProcess: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get the mock process from child_process mock
    const { spawn } = await import('child_process');
    mockProcess = spawn('ollama', ['serve']);

    // Create server instance
    server = new OllamaServer();
  });

  afterEach(() => {
    // Clean up
    vi.restoreAllMocks();
  });

  describe('startServer', () => {
    it('should start the server successfully with allocated port', async () => {
      await server.startServer();

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('ollama'),
        ['serve'],
        expect.objectContaining({
          env: expect.objectContaining({
            OLLAMA_HOST: '127.0.0.1:12345',
            OLLAMA_ORIGINS: 'http://localhost:54587',
          }),
        })
      );
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

    it('should set correct environment variables', async () => {
      await server.startServer();

      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            OLLAMA_HOST: expect.stringMatching(/127\.0\.0\.1:\d+/),
            OLLAMA_ORIGINS: 'http://localhost:54587',
            PATH: expect.any(String),
          }),
        })
      );
    });

    it('should handle packaged app binary path', async () => {
      vi.mocked(app).isPackaged = true;

      const packagedServer = new OllamaServer();
      await packagedServer.startServer();

      expect(spawn).toHaveBeenCalledWith(expect.stringContaining('binaries'), expect.any(Array), expect.any(Object));
    });

    it('should capture stdout and stderr', async () => {
      await server.startServer();

      // Get the actual mock process that was created
      const spawnCalls = vi.mocked(spawn).mock.calls;
      const lastCall = spawnCalls[spawnCalls.length - 1];

      // The mock returns an EventEmitter with stdout and stderr
      const process = vi.mocked(spawn).mock.results[spawnCalls.length - 1].value;

      // Verify that listeners are attached
      expect(process.stdout.listenerCount('data')).toBeGreaterThan(0);
      expect(process.stderr.listenerCount('data')).toBeGreaterThan(0);
    });
  });

  describe('stopServer', () => {
    it('should stop the server gracefully', async () => {
      await server.startServer();

      // Get the mock process
      const process = vi.mocked(spawn).mock.results[0].value;

      // Stop the server
      const stopPromise = server.stopServer();

      // Simulate process exit
      process.emit('exit', 0, null);

      await stopPromise;

      expect(process.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should do nothing if server is not running', async () => {
      await server.stopServer();

      expect(spawn).not.toHaveBeenCalled();
    });

    it('should handle force kill after timeout', async () => {
      await server.startServer();

      // Get the mock process
      const process = vi.mocked(spawn).mock.results[0].value;

      // Start stopping
      const stopPromise = server.stopServer();

      // Wait for timeout
      await waitFor(6000);

      // Should have tried SIGKILL
      expect(process.kill).toHaveBeenCalledWith('SIGKILL');

      // Simulate process finally exiting
      process.emit('exit', 137, 'SIGKILL');

      await stopPromise;
    }, 10000);

    it('should handle process exit with error code', async () => {
      await server.startServer();

      // Get the mock process
      const process = vi.mocked(spawn).mock.results[0].value;

      // Simulate process crash
      process.emit('exit', 1, null);

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

      // Get the mock process
      const process = vi.mocked(spawn).mock.results[0].value;

      const errorHandler = vi.fn();
      process.on('error', errorHandler);

      const testError = new Error('Process error');
      process.emit('error', testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });
  });

  describe('platform-specific behavior', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should use correct binary path for darwin platform', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const darwinServer = new OllamaServer();
      await darwinServer.startServer();

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('ollama-darwin'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use correct binary path for win32 platform', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const winServer = new OllamaServer();
      await winServer.startServer();

      expect(spawn).toHaveBeenCalledWith(expect.stringContaining('ollama.exe'), expect.any(Array), expect.any(Object));
    });

    it('should use correct binary path for linux platform', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      const linuxServer = new OllamaServer();
      await linuxServer.startServer();

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('ollama-linux'),
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple start requests', async () => {
      const startPromises = Array(5)
        .fill(null)
        .map(() => server.startServer());

      await Promise.all(startPromises);

      // Should only spawn once
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('should handle start during stop', async () => {
      await server.startServer();

      // Get the mock process
      const process = vi.mocked(spawn).mock.results[0].value;

      const stopPromise = server.stopServer();

      // Try to start while stopping
      await expect(server.startServer()).resolves.not.toThrow();

      // Emit exit to complete the stop
      process.emit('exit', 0, null);

      await stopPromise;
    });
  });
});
