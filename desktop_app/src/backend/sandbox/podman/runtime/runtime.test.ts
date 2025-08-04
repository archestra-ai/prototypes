import BinaryRunner from '@backend/utils/binaries';

import PodmanRuntime from './';

vi.mock('@backend/utils/binaries');

describe('PodmanRuntime', () => {
  let mockBinaryRunner: any;

  beforeEach(() => {
    // Reset the singleton state
    (PodmanRuntime as any).installedMachineName = null;
    (PodmanRuntime as any).installedMachineIsRunning = false;

    // Setup default mock for BinaryRunner
    mockBinaryRunner = {
      startProcess: vi.fn(),
    };

    vi.mocked(BinaryRunner).mockImplementation(() => mockBinaryRunner);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ensurePodmanIsInstalled', () => {
    it('should return true when machine is installed and running', async () => {
      const mockOutput = `NAME                     VM TYPE     CREATED         LAST UP            CPUS        MEMORY      DISK SIZE
podman-machine-default*  applehv     14 minutes ago  Currently running  5           2GiB        100GiB`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        // Call onStdout callback immediately with mock output
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      const result = await PodmanRuntime.ensurePodmanIsInstalled();

      expect(result).toBe(true);
      expect(vi.mocked(BinaryRunner)).toHaveBeenCalledWith(
        'podman',
        'podman-remote-static-v5.5.2',
        ['machine', 'ls'],
        {},
        expect.any(Function),
        undefined
      );
    });

    it('should return true when machine is installed but not running', async () => {
      const mockOutput = `NAME                     VM TYPE     CREATED        LAST UP     CPUS        MEMORY      DISK SIZE
podman-machine-default*  applehv     3 minutes ago  Never       5           2GiB        100GiB`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      const result = await PodmanRuntime.ensurePodmanIsInstalled();

      expect(result).toBe(true);
    });

    it('should return false when no machine is installed', async () => {
      const mockOutput = `NAME        VM TYPE     CREATED     LAST UP     CPUS        MEMORY      DISK SIZE
`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await PodmanRuntime.ensurePodmanIsInstalled();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Podman is not installed');

      consoleSpy.mockRestore();
    });

    it('should handle BinaryRunner errors', async () => {
      mockBinaryRunner.startProcess.mockImplementation(() => {
        throw new Error('Binary not found');
      });

      await expect(PodmanRuntime.ensurePodmanIsInstalled()).rejects.toThrow('Binary not found');
    });
  });

  describe('stopPodmanMachine', () => {
    it('should call podman machine stop', async () => {
      await PodmanRuntime.stopPodmanMachine();

      expect(vi.mocked(BinaryRunner)).toHaveBeenCalledWith(
        'podman',
        'podman-remote-static-v5.5.2',
        ['machine', 'stop'],
        {},
        undefined,
        undefined
      );
      expect(mockBinaryRunner.startProcess).toHaveBeenCalledTimes(1);
    });

    it('should handle stop command errors', async () => {
      mockBinaryRunner.startProcess.mockImplementation(() => {
        throw new Error('Failed to stop machine');
      });

      await expect(PodmanRuntime.stopPodmanMachine()).rejects.toThrow('Failed to stop machine');
    });
  });

  describe('checkInstalledMachines', () => {
    it('should parse machine list correctly with multiple machines', async () => {
      const mockOutput = `NAME                     VM TYPE     CREATED         LAST UP            CPUS        MEMORY      DISK SIZE
podman-machine-default*  applehv     14 minutes ago  Currently running  5           2GiB        100GiB
podman-machine-test      applehv     1 hour ago      Never              3           1GiB        50GiB`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      await PodmanRuntime.checkInstalledMachines();

      expect((PodmanRuntime as any).installedMachineName).toBe('podman-machine-default*');
      expect((PodmanRuntime as any).installedMachineIsRunning).toBe(true);
    });

    it('should handle empty machine list', async () => {
      const mockOutput = `NAME        VM TYPE     CREATED     LAST UP     CPUS        MEMORY      DISK SIZE
`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      await PodmanRuntime.checkInstalledMachines();

      expect((PodmanRuntime as any).installedMachineName).toBe(null);
      expect((PodmanRuntime as any).installedMachineIsRunning).toBe(false);
    });

    it('should handle malformed output gracefully', async () => {
      const mockOutput = `Invalid output format`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(mockOutput);
        }
        return mockBinaryRunner;
      });

      await PodmanRuntime.checkInstalledMachines();

      // Should not crash and maintain default state
      expect((PodmanRuntime as any).installedMachineName).toBe(null);
      expect((PodmanRuntime as any).installedMachineIsRunning).toBe(false);
    });
  });

  describe('private methods', () => {
    it('should correctly identify machine state from output', async () => {
      // Test "Never" state
      const neverOutput = `NAME                     VM TYPE     CREATED        LAST UP     CPUS        MEMORY      DISK SIZE
test-machine*  applehv     3 minutes ago  Never       5           2GiB        100GiB`;

      vi.mocked(BinaryRunner).mockImplementation((binary, version, args, env, onStdout) => {
        if (onStdout && args.includes('ls')) {
          onStdout(neverOutput);
        }
        return mockBinaryRunner;
      });

      await PodmanRuntime.checkInstalledMachines();

      expect((PodmanRuntime as any).installedMachineName).toBe('test-machine*');
      expect((PodmanRuntime as any).installedMachineIsRunning).toBe(false);
    });

    it('should use correct binary version', async () => {
      await PodmanRuntime.stopPodmanMachine();

      const [, version] = vi.mocked(BinaryRunner).mock.calls[0];
      expect(version).toBe('podman-remote-static-v5.5.2');
    });
  });
});
