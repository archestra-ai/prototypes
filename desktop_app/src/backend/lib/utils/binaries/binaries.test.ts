import fs from 'fs';
import * as os from 'os';
import path from 'path';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/mock/app/path'),
  },
}));

// Mock fs
vi.mock('fs');

// Mock os - but don't set default values yet
vi.mock('os');

// Test setup helper to reduce duplication
function setupMocks(options: {
  platform: NodeJS.Platform | string;
  arch: NodeJS.Architecture | string;
  fileExists?: boolean;
  isPackaged?: boolean;
  appPath?: string;
  resourcesPath?: string;
}) {
  const { platform, arch, fileExists = true, isPackaged = false, appPath = '/mock/app/path', resourcesPath } = options;

  vi.mocked(os.platform).mockReturnValue(platform as NodeJS.Platform);
  vi.mocked(os.arch).mockReturnValue(arch as NodeJS.Architecture);
  vi.mocked(fs.existsSync).mockReturnValue(fileExists);

  if (isPackaged !== undefined || appPath !== '/mock/app/path') {
    vi.doMock('electron', () => ({
      app: {
        isPackaged,
        getAppPath: vi.fn(() => appPath),
      },
    }));
  }

  if (resourcesPath !== undefined) {
    Object.defineProperty(process, 'resourcesPath', {
      value: resourcesPath,
      configurable: true,
    });
  }
}

describe('binaries utilities', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('getBinaryExecPath', () => {
    describe('platform detection', () => {
      it('should handle linux platforms', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toContain(path.join('linux', 'x86_64', 'ollama-v0.9.6'));
      });

      it('should handle mac platform', async () => {
        setupMocks({ platform: 'darwin', arch: 'arm64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toContain(path.join('mac', 'arm64', 'ollama-v0.9.6'));
      });

      it('should handle windows platform', async () => {
        setupMocks({ platform: 'win32', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toContain(path.join('win', 'x86_64', 'ollama-v0.9.6.exe'));
      });

      it('should map various linux platform identifiers', async () => {
        const linuxPlatforms = ['aix', 'freebsd', 'linux', 'openbsd', 'android'] as const;

        for (const platform of linuxPlatforms) {
          vi.resetModules();
          setupMocks({ platform, arch: 'x64' });

          const { getBinaryExecPath } = await import('./');
          const binaryPath = getBinaryExecPath('ollama-v0.9.6');
          expect(binaryPath).toContain(path.join('linux', 'x86_64'));
        }
      });

      it('should map darwin and sunos to mac', async () => {
        const macPlatforms = ['darwin', 'sunos'] as const;

        for (const platform of macPlatforms) {
          vi.resetModules();
          setupMocks({ platform, arch: 'x64' });

          const { getBinaryExecPath } = await import('./');
          const binaryPath = getBinaryExecPath('ollama-v0.9.6');
          expect(binaryPath).toContain(path.join('mac', 'x86_64'));
        }
      });

      it('should throw error for unsupported platform', async () => {
        setupMocks({ platform: 'unsupported', arch: 'x64' });

        await expect(import('./')).rejects.toThrow('Unsupported platform: unsupported');
      });
    });

    describe('architecture detection', () => {
      it('should handle arm64 architecture', async () => {
        setupMocks({ platform: 'darwin', arch: 'arm64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toContain(path.join('mac', 'arm64'));
      });

      it('should map x64 to x86_64', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toContain(path.join('linux', 'x86_64'));
      });

      it('should throw error for unsupported architecture', async () => {
        setupMocks({ platform: 'linux', arch: 'ia32' });

        await expect(import('./')).rejects.toThrow('Unsupported architecture: ia32');
      });
    });

    describe('binary path resolution', () => {
      it('should use resources path when app is packaged', async () => {
        // First reset the module cache
        vi.resetModules();

        const originalResourcesPath = process.resourcesPath;
        setupMocks({
          platform: 'linux',
          arch: 'x64',
          isPackaged: true,
          resourcesPath: '/packaged/resources',
        });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toBe(path.resolve('/packaged/resources/bin/ollama-v0.9.6'));

        // Restore original value
        Object.defineProperty(process, 'resourcesPath', {
          value: originalResourcesPath,
          configurable: true,
        });
      });

      it('should use app path when app is not packaged', async () => {
        // First reset the module cache
        vi.resetModules();

        setupMocks({
          platform: 'darwin',
          arch: 'arm64',
          isPackaged: false,
          appPath: '/dev/app/path',
        });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toBe(path.resolve('/dev/app/path/resources/bin/mac/arm64/ollama-v0.9.6'));
      });

      it('should add .exe extension on Windows', async () => {
        setupMocks({ platform: 'win32', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toMatch(/ollama-v0\.9\.6\.exe$/);
      });

      it('should not add .exe extension on non-Windows platforms', async () => {
        const nonWindowsPlatforms = ['linux', 'darwin'] as const;

        for (const platform of nonWindowsPlatforms) {
          vi.resetModules();
          setupMocks({ platform, arch: 'x64' });

          const { getBinaryExecPath } = await import('./');
          const binaryPath = getBinaryExecPath('ollama-v0.9.6');
          expect(binaryPath).not.toMatch(/\.exe$/);
        }
      });
    });

    describe('error handling', () => {
      it('should throw error when binary does not exist', async () => {
        setupMocks({ platform: 'linux', arch: 'x64', fileExists: false });

        const { getBinaryExecPath } = await import('./');
        expect(() => getBinaryExecPath('ollama-v0.9.6')).toThrow(/Binary ollama-v0\.9\.6 not found at/);
      });

      it('should include full path in error message', async () => {
        // First reset the module cache
        vi.resetModules();

        setupMocks({
          platform: 'darwin',
          arch: 'arm64',
          fileExists: false,
          appPath: '/test/app',
        });

        const { getBinaryExecPath } = await import('./');
        expect(() => getBinaryExecPath('ollama-v0.9.6')).toThrow(
          'Binary ollama-v0.9.6 not found at /test/app/resources/bin/mac/arm64/ollama-v0.9.6'
        );
      });
    });

    describe('integration scenarios', () => {
      it('should handle multiple calls with same binary', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const path1 = getBinaryExecPath('ollama-v0.9.6');
        const path2 = getBinaryExecPath('ollama-v0.9.6');

        expect(path1).toBe(path2);
        expect(fs.existsSync).toHaveBeenCalledTimes(2);
      });

      it('should return absolute paths', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(path.isAbsolute(binaryPath)).toBe(true);
      });

      it('should handle paths with spaces', async () => {
        // First reset the module cache
        vi.resetModules();

        setupMocks({
          platform: 'darwin',
          arch: 'arm64',
          appPath: '/path with spaces/app',
        });

        const { getBinaryExecPath } = await import('./');
        const binaryPath = getBinaryExecPath('ollama-v0.9.6');
        expect(binaryPath).toBe(path.resolve('/path with spaces/app/resources/bin/mac/arm64/ollama-v0.9.6'));
      });
    });
  });

  describe('BinaryRunner', () => {
    let mockSpawn: any;
    let mockProcess: any;

    beforeEach(() => {
      // Mock child_process spawn
      mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn(),
        once: vi.fn(),
        kill: vi.fn(),
      };

      mockSpawn = vi.fn(() => mockProcess);
      vi.doMock('child_process', () => ({
        spawn: mockSpawn,
      }));
    });

    afterEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
    });

    describe('constructor', () => {
      it('should initialize with correct parameters', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', ['--help'], { TEST: 'true' });

        expect(runner).toBeDefined();
      });
    });

    describe('startProcess', () => {
      it('should start the process successfully with correct arguments', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', ['serve'], {
          HOME: '/test/home',
          CUSTOM_VAR: 'value',
        });

        await runner.startProcess();

        expect(mockSpawn).toHaveBeenCalledWith(expect.stringContaining('ollama-v0.9.6'), ['serve'], {
          env: {
            HOME: '/test/home',
            CUSTOM_VAR: 'value',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      });

      it('should not start if already running', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();
        const initialCallCount = mockSpawn.mock.calls.length;

        await runner.startProcess();
        expect(mockSpawn.mock.calls.length).toBe(initialCallCount);
      });

      it('should handle spawn errors', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });
        mockSpawn.mockImplementationOnce(() => {
          throw new Error('Failed to spawn process');
        });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await expect(runner.startProcess()).rejects.toThrow('Failed to spawn process');
      });

      it('should handle process spawn ENOENT error', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });
        mockSpawn.mockImplementationOnce(() => {
          const error = new Error('spawn ENOENT') as any;
          error.code = 'ENOENT';
          throw error;
        });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await expect(runner.startProcess()).rejects.toThrow('ENOENT');
      });

      it('should capture stdout and stderr', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();

        expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
        expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
      });

      it('should handle process exit', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();

        // Simulate process exit
        const exitHandler = mockProcess.on.mock.calls.find((call: any) => call[0] === 'exit')?.[1];
        expect(exitHandler).toBeDefined();
        exitHandler(0, null);

        // Process should be able to start again
        await expect(runner.startProcess()).resolves.not.toThrow();
      });

      it('should handle process errors', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();

        const errorHandler = mockProcess.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
        expect(errorHandler).toBeDefined();

        // Simulate error
        const testError = new Error('Process error');
        errorHandler(testError);
      });
    });

    describe('stopProcess', () => {
      it('should stop the process gracefully', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();

        // Setup the exit listener
        mockProcess.once.mockImplementationOnce((event: string, callback: Function) => {
          if (event === 'exit') {
            setTimeout(() => callback(), 10);
          }
        });

        await runner.stopProcess();

        expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      });

      it('should do nothing if process is not running', async () => {
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.stopProcess();

        expect(mockSpawn).not.toHaveBeenCalled();
      });

      it('should handle force kill after timeout', async () => {
        vi.useFakeTimers();
        setupMocks({ platform: 'linux', arch: 'x64' });

        const { default: BinaryRunner } = await import('./');
        const runner = new BinaryRunner('TestProcess', 'ollama-v0.9.6', [], {});

        await runner.startProcess();

        // Setup the exit listener to not fire immediately
        let exitCallback: Function;
        mockProcess.once.mockImplementationOnce((event: string, callback: Function) => {
          if (event === 'exit') {
            exitCallback = callback;
          }
        });

        const stopPromise = runner.stopProcess();

        // Should have called SIGTERM first
        expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        expect(mockProcess.kill).toHaveBeenCalledTimes(1);

        // Fast forward past the timeout
        await vi.advanceTimersByTimeAsync(5001);

        // Should have called SIGKILL after timeout
        expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
        expect(mockProcess.kill).toHaveBeenCalledTimes(2);

        // Now trigger the exit callback
        exitCallback!();

        await stopPromise;
        vi.useRealTimers();
      });
    });
  });
});
