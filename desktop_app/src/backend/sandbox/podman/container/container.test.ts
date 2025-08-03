import PodmanLibpodApiClient from '@backend/lib/utils/podman';

import PodmanContainer from './';

vi.mock('@backend/lib/utils/podman');

describe('PodmanContainer', () => {
  let mockApiClient: any;
  
  beforeEach(() => {
    mockApiClient = {
      createContainer: vi.fn(),
      inspectContainer: vi.fn(),
      startContainer: vi.fn(),
    };
    
    vi.mocked(PodmanLibpodApiClient).mockReturnValue(mockApiClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      const container = new PodmanContainer(
        'test-container',
        'test/image:latest',
        'node',
        ['server.js'],
        { NODE_ENV: 'test' }
      );

      expect(container).toBeDefined();
      expect(vi.mocked(PodmanLibpodApiClient)).toHaveBeenCalledTimes(1);
    });
  });

  describe('startOrCreateContainer', () => {
    it('should create and start a new container when none exists', async () => {
      // Mock container not found
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      
      // Mock successful container creation
      mockApiClient.createContainer.mockResolvedValue({
        Id: 'container-123',
        Warnings: [],
      });

      const container = new PodmanContainer(
        'new-container',
        'test/image:latest',
        'python',
        ['app.py', '--port={{PORT}}'],
        { PYTHON_ENV: 'production' }
      );

      const result = await container.startOrCreateContainer(8080);

      expect(result).toEqual({
        port: 8080,
        url: 'http://localhost:8080',
      });

      expect(mockApiClient.inspectContainer).toHaveBeenCalledWith('new-container');
      expect(mockApiClient.createContainer).toHaveBeenCalledWith({
        name: 'new-container',
        image: 'test/image:latest',
        command: ['python', 'app.py', '--port=8080'],
        env: {
          PYTHON_ENV: 'production',
        },
        portmappings: [{
          host_port: 8080,
          container_port: 8080,
          protocol: 'tcp',
        }],
        start: true,
      });
    });

    it('should start existing stopped container', async () => {
      // Mock container exists but stopped
      mockApiClient.inspectContainer.mockResolvedValue({
        State: {
          Status: 'exited',
        },
      });

      mockApiClient.startContainer.mockResolvedValue({});

      const container = new PodmanContainer(
        'existing-container',
        'test/image:latest',
        'node',
        ['index.js'],
        {}
      );

      const result = await container.startOrCreateContainer(3000);

      expect(result).toEqual({
        port: 3000,
        url: 'http://localhost:3000',
      });

      expect(mockApiClient.startContainer).toHaveBeenCalledWith('existing-container');
      expect(mockApiClient.createContainer).not.toHaveBeenCalled();
    });

    it('should return success for already running container', async () => {
      // Mock container exists and running
      mockApiClient.inspectContainer.mockResolvedValue({
        State: {
          Status: 'running',
        },
      });

      const container = new PodmanContainer(
        'running-container',
        'test/image:latest',
        'deno',
        ['server.ts'],
        {}
      );

      const result = await container.startOrCreateContainer(9000);

      expect(result).toEqual({
        port: 9000,
        url: 'http://localhost:9000',
      });

      expect(mockApiClient.startContainer).not.toHaveBeenCalled();
      expect(mockApiClient.createContainer).not.toHaveBeenCalled();
    });

    it('should handle container creation errors', async () => {
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.createContainer.mockRejectedValue(new Error('Image not found'));

      const container = new PodmanContainer(
        'error-container',
        'nonexistent/image:latest',
        'node',
        ['app.js'],
        {}
      );

      await expect(container.startOrCreateContainer(8080)).rejects.toThrow('Image not found');
    });

    it('should handle container start errors', async () => {
      mockApiClient.inspectContainer.mockResolvedValue({
        State: {
          Status: 'exited',
        },
      });
      mockApiClient.startContainer.mockRejectedValue(new Error('Container corrupted'));

      const container = new PodmanContainer(
        'corrupt-container',
        'test/image:latest',
        'node',
        ['app.js'],
        {}
      );

      await expect(container.startOrCreateContainer(8080)).rejects.toThrow('Container corrupted');
    });

    it('should replace {{PORT}} placeholder in arguments', async () => {
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.createContainer.mockResolvedValue({
        Id: 'container-456',
        Warnings: [],
      });

      const container = new PodmanContainer(
        'port-placeholder-container',
        'test/image:latest',
        'ruby',
        ['server.rb', '--bind=0.0.0.0', '--port={{PORT}}', '--workers=4'],
        { RUBY_ENV: 'test' }
      );

      await container.startOrCreateContainer(4567);

      expect(mockApiClient.createContainer).toHaveBeenCalledWith({
        name: 'port-placeholder-container',
        image: 'test/image:latest',
        command: ['ruby', 'server.rb', '--bind=0.0.0.0', '--port=4567', '--workers=4'],
        env: {
          RUBY_ENV: 'test',
        },
        portmappings: [{
          host_port: 4567,
          container_port: 4567,
          protocol: 'tcp',
        }],
        start: true,
      });
    });

    it('should handle empty environment variables', async () => {
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.createContainer.mockResolvedValue({
        Id: 'container-789',
        Warnings: [],
      });

      const container = new PodmanContainer(
        'no-env-container',
        'minimal/image:alpine',
        'sh',
        ['-c', 'echo "Hello World"'],
        {}
      );

      await container.startOrCreateContainer(8888);

      expect(mockApiClient.createContainer).toHaveBeenCalledWith({
        name: 'no-env-container',
        image: 'minimal/image:alpine',
        command: ['sh', '-c', 'echo "Hello World"'],
        env: {},
        portmappings: [{
          host_port: 8888,
          container_port: 8888,
          protocol: 'tcp',
        }],
        start: true,
      });
    });

    it('should handle non-404 inspect errors', async () => {
      mockApiClient.inspectContainer.mockRejectedValue(new Error('Network timeout'));

      const container = new PodmanContainer(
        'timeout-container',
        'test/image:latest',
        'node',
        ['app.js'],
        {}
      );

      await expect(container.startOrCreateContainer(8080)).rejects.toThrow('Network timeout');
    });
  });

  describe('edge cases', () => {
    it('should handle container with no arguments', async () => {
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.createContainer.mockResolvedValue({
        Id: 'container-no-args',
        Warnings: [],
      });

      const container = new PodmanContainer(
        'no-args-container',
        'test/image:latest',
        'binary',
        [],
        { ENV_VAR: 'value' }
      );

      await container.startOrCreateContainer(7777);

      expect(mockApiClient.createContainer).toHaveBeenCalledWith({
        name: 'no-args-container',
        image: 'test/image:latest',
        command: ['binary'],
        env: {
          ENV_VAR: 'value',
        },
        portmappings: [{
          host_port: 7777,
          container_port: 7777,
          protocol: 'tcp',
        }],
        start: true,
      });
    });

    it('should handle multiple {{PORT}} placeholders', async () => {
      mockApiClient.inspectContainer.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.createContainer.mockResolvedValue({
        Id: 'multi-port-container',
        Warnings: [],
      });

      const container = new PodmanContainer(
        'multi-port-container',
        'test/image:latest',
        'app',
        ['--primary-port={{PORT}}', '--secondary-port={{PORT}}', '--admin-port={{PORT}}'],
        {}
      );

      await container.startOrCreateContainer(5000);

      expect(mockApiClient.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          command: ['app', '--primary-port=5000', '--secondary-port=5000', '--admin-port=5000'],
        })
      );
    });
  });
});