import PodmanContainer from '@backend/sandbox/podman/container';
import PodmanImage from '@backend/sandbox/podman/image';

import SandboxedMCP from './';

vi.mock('../podman/image');
vi.mock('../podman/container');

describe('SandboxedMCP', () => {
  const mockServerConfig = {
    image: 'test/mcp-server:latest',
    command: 'node',
    args: ['server.js', '--port', '{{PORT}}'],
    env: {
      NODE_ENV: 'production',
      API_KEY: 'test-key',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided server name and config', () => {
      const sandboxedMCP = new SandboxedMCP('test-server', mockServerConfig);
      
      expect(sandboxedMCP).toBeDefined();
      expect(vi.mocked(PodmanImage)).toHaveBeenCalledWith(mockServerConfig.image);
      expect(vi.mocked(PodmanContainer)).toHaveBeenCalledWith(
        'test-server',
        mockServerConfig.image,
        mockServerConfig.command,
        mockServerConfig.args,
        mockServerConfig.env
      );
    });
  });

  describe('start', () => {
    it('should successfully pull image and start container', async () => {
      const mockPullImage = vi.fn().mockResolvedValue(undefined);
      const mockStartContainer = vi.fn().mockResolvedValue({
        port: 8080,
        url: 'http://localhost:8080',
      });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: mockPullImage,
      } as any));

      vi.mocked(PodmanContainer).mockImplementation(() => ({
        startOrCreateContainer: mockStartContainer,
      } as any));

      const sandboxedMCP = new SandboxedMCP('test-server', mockServerConfig);
      const result = await sandboxedMCP.start(8080);

      expect(mockPullImage).toHaveBeenCalledTimes(1);
      expect(mockStartContainer).toHaveBeenCalledWith(8080);
      expect(result).toEqual({
        port: 8080,
        url: 'http://localhost:8080',
      });
    });

    it('should handle image pull failure', async () => {
      const mockPullImage = vi.fn().mockRejectedValue(new Error('Failed to pull image'));
      const mockStartContainer = vi.fn();

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: mockPullImage,
      } as any));

      vi.mocked(PodmanContainer).mockImplementation(() => ({
        startOrCreateContainer: mockStartContainer,
      } as any));

      const sandboxedMCP = new SandboxedMCP('test-server', mockServerConfig);

      await expect(sandboxedMCP.start(8080)).rejects.toThrow('Failed to pull image');
      expect(mockPullImage).toHaveBeenCalledTimes(1);
      expect(mockStartContainer).not.toHaveBeenCalled();
    });

    it('should handle container start failure', async () => {
      const mockPullImage = vi.fn().mockResolvedValue(undefined);
      const mockStartContainer = vi.fn().mockRejectedValue(new Error('Container start failed'));

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: mockPullImage,
      } as any));

      vi.mocked(PodmanContainer).mockImplementation(() => ({
        startOrCreateContainer: mockStartContainer,
      } as any));

      const sandboxedMCP = new SandboxedMCP('failing-server', mockServerConfig);

      await expect(sandboxedMCP.start(8080)).rejects.toThrow('Container start failed');
      expect(mockPullImage).toHaveBeenCalledTimes(1);
      expect(mockStartContainer).toHaveBeenCalledTimes(1);
    });

    it('should pass port to container start method', async () => {
      const mockPullImage = vi.fn().mockResolvedValue(undefined);
      const mockStartContainer = vi.fn().mockResolvedValue({
        port: 3456,
        url: 'http://localhost:3456',
      });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: mockPullImage,
      } as any));

      vi.mocked(PodmanContainer).mockImplementation(() => ({
        startOrCreateContainer: mockStartContainer,
      } as any));

      const sandboxedMCP = new SandboxedMCP('port-test-server', mockServerConfig);
      const result = await sandboxedMCP.start(3456);

      expect(mockStartContainer).toHaveBeenCalledWith(3456);
      expect(result.port).toBe(3456);
      expect(result.url).toBe('http://localhost:3456');
    });

    it('should handle server config without environment variables', async () => {
      const minimalConfig = {
        image: 'minimal/server:1.0',
        command: 'python',
        args: ['app.py'],
        env: {},
      };

      let capturedEnv: any;
      vi.mocked(PodmanContainer).mockImplementation((name, image, command, args, env) => {
        capturedEnv = env;
        return {
          startOrCreateContainer: vi.fn().mockResolvedValue({
            port: 8080,
            url: 'http://localhost:8080',
          }),
        } as any;
      });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: vi.fn().mockResolvedValue(undefined),
      } as any));

      const sandboxedMCP = new SandboxedMCP('minimal-server', minimalConfig);
      await sandboxedMCP.start(8080);

      expect(capturedEnv).toEqual({});
    });

    it('should handle complex server arguments with port placeholder', async () => {
      const configWithPortPlaceholder = {
        image: 'complex/server:latest',
        command: 'deno',
        args: ['run', '--allow-net', 'server.ts', '--port={{PORT}}', '--host=0.0.0.0'],
        env: { DENO_ENV: 'production' },
      };

      let capturedArgs: any;
      vi.mocked(PodmanContainer).mockImplementation((name, image, command, args) => {
        capturedArgs = args;
        return {
          startOrCreateContainer: vi.fn().mockResolvedValue({
            port: 9999,
            url: 'http://localhost:9999',
          }),
        } as any;
      });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: vi.fn().mockResolvedValue(undefined),
      } as any));

      const sandboxedMCP = new SandboxedMCP('complex-server', configWithPortPlaceholder);
      await sandboxedMCP.start(9999);

      expect(capturedArgs).toEqual([
        'run',
        '--allow-net',
        'server.ts',
        '--port={{PORT}}',
        '--host=0.0.0.0',
      ]);
    });

    it('should handle multiple sequential starts', async () => {
      const mockPullImage = vi.fn().mockResolvedValue(undefined);
      const mockStartContainer = vi.fn()
        .mockResolvedValueOnce({ port: 8000, url: 'http://localhost:8000' })
        .mockResolvedValueOnce({ port: 8001, url: 'http://localhost:8001' });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: mockPullImage,
      } as any));

      vi.mocked(PodmanContainer).mockImplementation(() => ({
        startOrCreateContainer: mockStartContainer,
      } as any));

      const sandboxedMCP = new SandboxedMCP('multi-start-server', mockServerConfig);
      
      const result1 = await sandboxedMCP.start(8000);
      expect(result1).toEqual({ port: 8000, url: 'http://localhost:8000' });
      
      const result2 = await sandboxedMCP.start(8001);
      expect(result2).toEqual({ port: 8001, url: 'http://localhost:8001' });
      
      expect(mockPullImage).toHaveBeenCalledTimes(2);
      expect(mockStartContainer).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty args array', async () => {
      const configWithEmptyArgs = {
        image: 'simple/server:latest',
        command: 'binary',
        args: [],
        env: {},
      };

      let capturedArgs: any;
      vi.mocked(PodmanContainer).mockImplementation((name, image, command, args) => {
        capturedArgs = args;
        return {
          startOrCreateContainer: vi.fn().mockResolvedValue({
            port: 7000,
            url: 'http://localhost:7000',
          }),
        } as any;
      });

      vi.mocked(PodmanImage).mockImplementation(() => ({
        pullImage: vi.fn().mockResolvedValue(undefined),
      } as any));

      const sandboxedMCP = new SandboxedMCP('empty-args-server', configWithEmptyArgs);
      await sandboxedMCP.start(7000);

      expect(capturedArgs).toEqual([]);
    });

    it('should handle special characters in server name', () => {
      const specialName = 'test-server_123!@#';
      
      const sandboxedMCP = new SandboxedMCP(specialName, mockServerConfig);
      
      expect(vi.mocked(PodmanContainer)).toHaveBeenCalledWith(
        specialName,
        mockServerConfig.image,
        mockServerConfig.command,
        mockServerConfig.args,
        mockServerConfig.env
      );
    });
  });
});