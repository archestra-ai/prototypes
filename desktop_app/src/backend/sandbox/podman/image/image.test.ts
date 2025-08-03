import PodmanLibpodApiClient from '@backend/lib/utils/podman';

import PodmanImage from './';

vi.mock('@backend/lib/utils/podman');

describe('PodmanImage', () => {
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      inspectImage: vi.fn(),
      pullImage: vi.fn(),
    };

    vi.mocked(PodmanLibpodApiClient).mockReturnValue(mockApiClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided image name', () => {
      const image = new PodmanImage('test/image:latest');

      expect(image).toBeDefined();
      expect(vi.mocked(PodmanLibpodApiClient)).toHaveBeenCalledTimes(1);
    });
  });

  describe('pullImage', () => {
    it('should skip pull if image already exists', async () => {
      // Mock image exists
      mockApiClient.inspectImage.mockResolvedValue({
        Id: 'sha256:abc123',
        RepoTags: ['test/image:latest'],
      });

      const image = new PodmanImage('test/image:latest');
      await image.pullImage();

      expect(mockApiClient.inspectImage).toHaveBeenCalledWith('test/image:latest');
      expect(mockApiClient.pullImage).not.toHaveBeenCalled();
    });

    it('should pull image when it does not exist', async () => {
      // Mock image not found
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      
      // Mock successful pull
      mockApiClient.pullImage.mockResolvedValue({
        stream: 'Successfully pulled image',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const image = new PodmanImage('new/image:v1.0');
      await image.pullImage();

      expect(mockApiClient.inspectImage).toHaveBeenCalledWith('new/image:v1.0');
      expect(mockApiClient.pullImage).toHaveBeenCalledWith('new/image:v1.0');
      expect(consoleSpy).toHaveBeenCalledWith('Pulling image new/image:v1.0...');

      consoleSpy.mockRestore();
    });

    it('should handle image pull failures', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockRejectedValue(new Error('Network error'));

      const image = new PodmanImage('failing/image:latest');

      await expect(image.pullImage()).rejects.toThrow('Network error');
    });

    it('should handle non-404 inspect errors', async () => {
      mockApiClient.inspectImage.mockRejectedValue(new Error('API connection failed'));

      const image = new PodmanImage('error/image:latest');

      await expect(image.pullImage()).rejects.toThrow('API connection failed');
    });

    it('should handle image with digest format', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockResolvedValue({
        stream: 'Successfully pulled image',
      });

      const digestImage = 'registry.example.com/app@sha256:abcdef1234567890';
      const image = new PodmanImage(digestImage);
      await image.pullImage();

      expect(mockApiClient.pullImage).toHaveBeenCalledWith(digestImage);
    });

    it('should handle image without tag', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockResolvedValue({
        stream: 'Successfully pulled image',
      });

      const image = new PodmanImage('ubuntu');
      await image.pullImage();

      expect(mockApiClient.inspectImage).toHaveBeenCalledWith('ubuntu');
      expect(mockApiClient.pullImage).toHaveBeenCalledWith('ubuntu');
    });

    it('should handle image from private registry', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockResolvedValue({
        stream: 'Successfully pulled image',
      });

      const privateImage = 'private.registry.com:5000/my-app:v2.0';
      const image = new PodmanImage(privateImage);
      await image.pullImage();

      expect(mockApiClient.pullImage).toHaveBeenCalledWith(privateImage);
    });

    it('should log appropriate message when pulling', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockResolvedValue({});

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const image = new PodmanImage('app:latest');
      await image.pullImage();

      expect(consoleSpy).toHaveBeenCalledWith('Pulling image app:latest...');

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle very long image names', async () => {
      const longImageName = 'very-long-registry-name.example.com:8080/deeply/nested/path/to/image:tag-with-very-long-version-string-v1.2.3-alpha-beta-gamma';
      
      mockApiClient.inspectImage.mockResolvedValue({
        Id: 'sha256:123456',
        RepoTags: [longImageName],
      });

      const image = new PodmanImage(longImageName);
      await image.pullImage();

      expect(mockApiClient.inspectImage).toHaveBeenCalledWith(longImageName);
    });

    it('should handle image names with special characters', async () => {
      const specialImage = 'registry/my_app-test.v2:1.0.0_rc1';
      
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      mockApiClient.pullImage.mockResolvedValue({});

      const image = new PodmanImage(specialImage);
      await image.pullImage();

      expect(mockApiClient.pullImage).toHaveBeenCalledWith(specialImage);
    });

    it('should handle concurrent pull attempts', async () => {
      mockApiClient.inspectImage.mockRejectedValue({ response: { status: 404 } });
      
      let pullCallCount = 0;
      mockApiClient.pullImage.mockImplementation(async () => {
        pullCallCount++;
        // Simulate some delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return { stream: 'Success' };
      });

      const image = new PodmanImage('concurrent/image:latest');
      
      // Start multiple pulls concurrently
      const pulls = Promise.all([
        image.pullImage(),
        image.pullImage(),
        image.pullImage(),
      ]);

      await pulls;

      // All pulls should complete successfully
      expect(pullCallCount).toBe(3);
    });
  });
});