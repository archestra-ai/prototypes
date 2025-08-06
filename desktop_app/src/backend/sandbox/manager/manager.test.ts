import getPort from 'get-port';

import { McpServerModel } from '@backend/models';
import PodmanContainer from '@backend/sandbox/podman/container';
import PodmanRuntime from '@backend/sandbox/podman/runtime';

import McpServerSandboxManager from './';

vi.mock('../podman/runtime');
vi.mock('../podman/container');
vi.mock('get-port');

// Test helper functions
function createMockServerConfig(overrides: any = {}) {
  return {
    image: 'test/image:latest',
    command: 'node',
    args: ['server.js'],
    env: { NODE_ENV: 'test' },
    ...overrides,
  };
}

describe('McpServerSandboxManager', () => {
  beforeEach(async () => {
    // Reset singleton instance
    (McpServerSandboxManager as any).instance = null;

    // Setup default mocks
    vi.mocked(getPort).mockResolvedValue(3000);
    vi.mocked(PodmanRuntime).ensurePodmanIsInstalled.mockResolvedValue(true);
    vi.mocked(PodmanRuntime).stopPodmanMachine.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = McpServerSandboxManager.getInstance();
      const instance2 = McpServerSandboxManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('startAllInstalledMcpServers', () => {
    it('should successfully start all installed MCP servers', async () => {
      // Create test MCP servers
      await McpServerModel.create({
        name: 'test-server-1',
        serverConfig: createMockServerConfig({
          image: 'test/image:1',
          env: { NODE_ENV: 'test' },
        }),
      });

      await McpServerModel.create({
        name: 'test-server-2',
        serverConfig: createMockServerConfig({
          image: 'test/image:2',
          command: 'python',
          args: ['server.py'],
          env: { PYTHON_ENV: 'test' },
        }),
      });

      const mockStart = vi.fn().mockResolvedValue({ port: 3000, url: 'http://localhost:3000' });
      vi.mocked(PodmanContainer).mockImplementation(
        () =>
          ({
            start: mockStart,
          }) as any
      );

      const manager = McpServerSandboxManager.getInstance();
      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({
        'test-server-1': { port: 3000, url: 'http://localhost:3000' },
        'test-server-2': { port: 3000, url: 'http://localhost:3000' },
      });

      expect(vi.mocked(PodmanRuntime).ensurePodmanIsInstalled).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(2);
      expect(vi.mocked(getPort)).toHaveBeenCalledTimes(2);
    });

    it('should handle empty MCP servers list', async () => {
      const manager = McpServerSandboxManager.getInstance();
      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({});
      expect(vi.mocked(PodmanRuntime).ensurePodmanIsInstalled).toHaveBeenCalledTimes(1);
    });

    it('should handle server start failures gracefully', async () => {
      // Create test MCP server
      await McpServerModel.create({
        name: 'failing-server',
        serverConfig: createMockServerConfig({
          image: 'test/failing:1',
        }),
      });

      const mockStart = vi.fn().mockRejectedValue(new Error('Container start failed'));
      vi.mocked(PodmanContainer).mockImplementation(
        () =>
          ({
            start: mockStart,
          }) as any
      );

      const manager = McpServerSandboxManager.getInstance();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('Failed to start MCP server failing-server:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle Podman installation failure', async () => {
      vi.mocked(PodmanRuntime).ensurePodmanIsInstalled.mockResolvedValue(false);

      const manager = McpServerSandboxManager.getInstance();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('Podman is not installed. Cannot start MCP servers.');

      consoleSpy.mockRestore();
    });

    it('should allocate unique ports for each server', async () => {
      // Create multiple test MCP servers
      await McpServerModel.create({
        name: 'server-1',
        serverConfig: createMockServerConfig({ image: 'test:1' }),
      });

      await McpServerModel.create({
        name: 'server-2',
        serverConfig: createMockServerConfig({ image: 'test:2' }),
      });

      let portCounter = 3000;
      vi.mocked(getPort).mockImplementation(async () => portCounter++);

      const mockStart = vi.fn().mockImplementation(async (port) => ({
        port,
        url: `http://localhost:${port}`,
      }));

      vi.mocked(PodmanContainer).mockImplementation(
        () =>
          ({
            start: mockStart,
          }) as any
      );

      const manager = McpServerSandboxManager.getInstance();
      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({
        'server-1': { port: 3000, url: 'http://localhost:3000' },
        'server-2': { port: 3001, url: 'http://localhost:3001' },
      });

      expect(mockStart).toHaveBeenCalledWith(3000);
      expect(mockStart).toHaveBeenCalledWith(3001);
    });

    it('should handle concurrent server starts', async () => {
      // Create multiple servers
      const serverPromises = Array.from({ length: 3 }, (_, i) =>
        McpServerModel.create({
          name: `concurrent-server-${i}`,
          serverConfig: createMockServerConfig({ image: `test:${i}` }),
        })
      );
      await Promise.all(serverPromises);

      let portCounter = 4000;
      vi.mocked(getPort).mockImplementation(async () => portCounter++);

      const mockStart = vi.fn().mockImplementation(async (port) => {
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { port, url: `http://localhost:${port}` };
      });

      vi.mocked(PodmanContainer).mockImplementation(
        () =>
          ({
            start: mockStart,
          }) as any
      );

      const manager = McpServerSandboxManager.getInstance();
      const result = await manager.startAllInstalledMcpServers();

      expect(Object.keys(result)).toHaveLength(3);
      expect(mockStart).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopAllInstalledMcpServers', () => {
    it('should successfully stop the Podman machine', async () => {
      const manager = McpServerSandboxManager.getInstance();
      await manager.stopAllInstalledMcpServers();

      expect(vi.mocked(PodmanRuntime).stopPodmanMachine).toHaveBeenCalledTimes(1);
    });

    it('should handle stop failure gracefully', async () => {
      vi.mocked(PodmanRuntime).stopPodmanMachine.mockRejectedValue(new Error('Stop failed'));

      const manager = McpServerSandboxManager.getInstance();

      await expect(manager.stopAllInstalledMcpServers()).rejects.toThrow('Stop failed');
    });
  });

  describe('error handling', () => {
    it('should properly pass server configuration to PodmanContainer', async () => {
      const serverConfig = {
        image: 'custom/image:latest',
        command: 'deno',
        args: ['run', 'server.ts'],
        env: { CUSTOM_VAR: 'value' },
      };

      await McpServerModel.create({
        name: 'custom-server',
        serverConfig,
      });

      let capturedConfig: any;
      vi.mocked(PodmanContainer).mockImplementation((name, config) => {
        capturedConfig = config;
        return {
          start: vi.fn().mockResolvedValue({ port: 3000, url: 'http://localhost:3000' }),
        } as any;
      });

      const manager = McpServerSandboxManager.getInstance();
      await manager.startAllInstalledMcpServers();

      expect(capturedConfig).toEqual(serverConfig);
      expect(vi.mocked(PodmanContainer)).toHaveBeenCalledWith('custom-server', serverConfig);
    });

    it('should handle get-port failures', async () => {
      await McpServerModel.create({
        name: 'port-fail-server',
        serverConfig: createMockServerConfig(),
      });

      vi.mocked(getPort).mockRejectedValue(new Error('No available ports'));

      const manager = McpServerSandboxManager.getInstance();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await manager.startAllInstalledMcpServers();

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('Failed to start MCP server port-fail-server:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
