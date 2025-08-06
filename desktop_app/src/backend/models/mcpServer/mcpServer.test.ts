import { ServerConfig } from '@archestra/types';

import McpServerModel from './';

// Test helper functions
function createMockServerConfig() {
  return {
    command: 'node',
    args: ['--version'],
    env: {},
  };
}

function createMockMcpServer(overrides: any = {}) {
  return {
    name: 'test-mcp-server',
    serverConfig: {
      command: 'node',
      args: ['server.js'],
      env: {},
      ...overrides,
    },
  };
}

describe('McpServerModel', async () => {
  describe('create', () => {
    it('should create a new MCP server with all fields', async () => {
      const serverData = createMockMcpServer({
        command: 'python',
        args: ['-m', 'server'],
        env: { API_KEY: 'test-key' },
      });

      const [createdMcpServer] = await McpServerModel.create(serverData);

      expect(createdMcpServer).toBeDefined();
      expect(createdMcpServer.name).toBe('test-mcp-server');
      expect(createdMcpServer.serverConfig).toEqual({
        command: 'python',
        args: ['-m', 'server'],
        env: { API_KEY: 'test-key' },
      });
      expect(createdMcpServer.id).toBeDefined();
      expect(createdMcpServer.createdAt).toBeDefined();
      expect(typeof createdMcpServer.createdAt).toBe('string');
    });

    it('should enforce unique server names', async () => {
      const serverData = createMockMcpServer();

      // Create first server
      await McpServerModel.create(serverData);

      // Attempt to create duplicate
      await expect(McpServerModel.create(serverData)).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('should handle empty args array', async () => {
      const serverData = {
        name: 'minimal-server',
        serverConfig: {
          command: 'node',
          args: [],
          env: {},
        } as ServerConfig,
      };

      const [created] = await McpServerModel.create(serverData);
      expect(created.serverConfig.args).toEqual([]);
    });

    it('should handle complex serverConfig', async () => {
      const complexConfig = {
        command: '/usr/bin/python3',
        args: ['--port', '8080', '--verbose'],
        env: {
          NODE_ENV: 'test',
          API_KEY: 'secret',
          DEBUG: 'true',
        },
      };

      const serverData = {
        name: 'complex-server',
        serverConfig: complexConfig,
      };

      const [created] = await McpServerModel.create(serverData);
      expect(created.serverConfig).toEqual(complexConfig);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no servers exist', async () => {
      const servers = await McpServerModel.getAll();
      expect(servers).toEqual([]);
    });

    it('should return all servers', async () => {
      // Create multiple servers
      await McpServerModel.create({
        name: 'server1',
        serverConfig: createMockServerConfig(),
      });

      await McpServerModel.create({
        name: 'server2',
        serverConfig: createMockServerConfig(),
      });

      await McpServerModel.create({
        name: 'server3',
        serverConfig: createMockServerConfig(),
      });

      const servers = await McpServerModel.getAll();

      expect(servers).toHaveLength(3);
      const serverNames = servers.map((s) => s.name);
      expect(serverNames).toContain('server1');
      expect(serverNames).toContain('server2');
      expect(serverNames).toContain('server3');
    });

    it('should properly deserialize serverConfig', async () => {
      const complexConfig = {
        command: 'docker',
        args: ['run', '-p', '8080:8080', 'image:latest'],
        env: {
          DOCKER_HOST: 'unix:///var/run/docker.sock',
        },
      };

      await McpServerModel.create({
        name: 'docker-server',
        serverConfig: complexConfig,
      });

      const servers = await McpServerModel.getAll();
      expect(servers[0].serverConfig).toEqual(complexConfig);
    });
  });

  describe('getById', () => {
    it('should return server by id', async () => {
      const [createdMcpServer] = await McpServerModel.create(createMockMcpServer());
      const [foundMcpServer] = await McpServerModel.getById(createdMcpServer.id);

      expect(foundMcpServer).toBeDefined();
      expect(foundMcpServer.id).toBe(createdMcpServer.id);
      expect(foundMcpServer.name).toBe(createdMcpServer.name);
      expect(foundMcpServer.serverConfig).toEqual(createdMcpServer.serverConfig);
    });

    it('should return empty array for non-existent id', async () => {
      const servers = await McpServerModel.getById(999999);
      expect(servers).toEqual([]);
    });

    it('should return empty array for negative id', async () => {
      const servers = await McpServerModel.getById(-1);
      expect(servers).toEqual([]);
    });
  });

  describe('database constraints', () => {
    it('should not allow null name', async () => {
      await expect(
        McpServerModel.create({
          name: null as any,
          serverConfig: createMockServerConfig(),
        })
      ).rejects.toThrow();
    });

    it('should not allow null serverConfig', async () => {
      await expect(
        McpServerModel.create({
          name: 'test-server',
          serverConfig: null as any,
        })
      ).rejects.toThrow();
    });

    it('should auto-generate timestamps', async () => {
      const [createdMcpServer] = await McpServerModel.create(createMockMcpServer());

      expect(createdMcpServer.createdAt).toBeDefined();
      expect(typeof createdMcpServer.createdAt).toBe('string');

      // Verify it's a valid timestamp string
      const createdAtDate = new Date(createdMcpServer.createdAt);
      expect(createdAtDate.toString()).not.toBe('Invalid Date');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent creates with unique names', async () => {
      const creates = Array.from({ length: 5 }, (_, i) =>
        McpServerModel.create({
          name: `concurrent-server-${i}`,
          serverConfig: createMockServerConfig(),
        })
      );

      const results = (await Promise.all(creates)).flat();

      expect(results).toHaveLength(5);
      const names = results.map((r) => r.name);
      expect(new Set(names).size).toBe(5); // All unique
    });
  });

  describe('edge cases', () => {
    it('should handle very long server names', async () => {
      const longName = 'a'.repeat(255);

      const [createdMcpServer] = await McpServerModel.create({
        name: longName,
        serverConfig: createMockServerConfig(),
      });

      expect(createdMcpServer.name).toBe(longName);
    });

    it('should handle special characters in names', async () => {
      const specialName = 'test-server_123!@#$%^&*()';

      const [createdMcpServer] = await McpServerModel.create({
        name: specialName,
        serverConfig: createMockServerConfig(),
      });

      expect(createdMcpServer.name).toBe(specialName);
    });

    it('should handle unicode in serverConfig', async () => {
      const unicodeConfig = {
        command: 'python',
        args: ['script.py', '你好', '🚀'],
        env: {
          LANG: 'zh_CN.UTF-8',
          MESSAGE: '世界',
        },
      };

      const [createdMcpServer] = await McpServerModel.create({
        name: 'unicode-server',
        serverConfig: unicodeConfig,
      });

      expect(createdMcpServer.serverConfig).toEqual(unicodeConfig);
    });
  });
});
