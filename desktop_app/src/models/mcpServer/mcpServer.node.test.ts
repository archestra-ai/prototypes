import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import { mcpServersTable } from '@/database/schema/mcpServer';
import MCPServer from './index';

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

describe('MCPServer Model', () => {
  let db: BetterSQLite3Database;
  let sqlite: Database.Database;

  beforeEach(async () => {
    // Create in-memory database
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, {
      casing: 'snake_case',
    });

    // Run migrations
    const migrationsFolder = path.join(__dirname, '../../../drizzle');
    await migrate(db, { migrationsFolder });
  });

  afterEach(() => {
    // Close database connection
    sqlite.close();
  });

  describe('create', () => {
    it('should create a new MCP server with all fields', async () => {
      const serverData = createMockMcpServer({
        command: 'python',
        args: ['-m', 'server'],
        env: { API_KEY: 'test-key' },
      });

      const created = await MCPServer.create.call({ db }, serverData);

      expect(created).toBeDefined();
      expect(created.name).toBe('test-mcp-server');
      expect(created.serverConfig).toEqual({
        command: 'python',
        args: ['-m', 'server'],
        env: { API_KEY: 'test-key' },
      });
      expect(created.id).toBeDefined();
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it('should enforce unique server names', async () => {
      const serverData = createMockMcpServer();

      // Create first server
      await MCPServer.create.call({ db }, serverData);

      // Attempt to create duplicate
      await expect(MCPServer.create.call({ db }, serverData)).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('should handle empty args array', async () => {
      const serverData = {
        name: 'minimal-server',
        serverConfig: {
          command: 'node',
          args: [],
          env: {},
        },
      };

      const created = await MCPServer.create.call({ db }, serverData);
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

      const created = await MCPServer.create.call({ db }, serverData);
      expect(created.serverConfig).toEqual(complexConfig);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no servers exist', async () => {
      const servers = await MCPServer.getAll.call({ db });
      expect(servers).toEqual([]);
    });

    it('should return all servers ordered by creation date', async () => {
      // Create multiple servers with slight delays to ensure different timestamps
      const server1 = await MCPServer.create.call(
        { db },
        {
          name: 'server1',
          serverConfig: createMockServerConfig(),
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const server2 = await MCPServer.create.call(
        { db },
        {
          name: 'server2',
          serverConfig: createMockServerConfig(),
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const server3 = await MCPServer.create.call(
        { db },
        {
          name: 'server3',
          serverConfig: createMockServerConfig(),
        }
      );

      const servers = await MCPServer.getAll.call({ db });

      expect(servers).toHaveLength(3);
      expect(servers[0].name).toBe('server3'); // Most recent first
      expect(servers[1].name).toBe('server2');
      expect(servers[2].name).toBe('server1');
    });

    it('should properly deserialize serverConfig', async () => {
      const complexConfig = {
        command: 'docker',
        args: ['run', '-p', '8080:8080', 'image:latest'],
        env: {
          DOCKER_HOST: 'unix:///var/run/docker.sock',
        },
      };

      await MCPServer.create.call(
        { db },
        {
          name: 'docker-server',
          serverConfig: complexConfig,
        }
      );

      const servers = await MCPServer.getAll.call({ db });
      expect(servers[0].serverConfig).toEqual(complexConfig);
    });
  });

  describe('getById', () => {
    it('should return server by id', async () => {
      const created = await MCPServer.create.call({ db }, createMockMcpServer());
      const [found] = await MCPServer.getById.call({ db }, created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.name).toBe(created.name);
      expect(found.serverConfig).toEqual(created.serverConfig);
    });

    it('should return empty array for non-existent id', async () => {
      const servers = await MCPServer.getById.call({ db }, 999999);
      expect(servers).toEqual([]);
    });

    it('should return empty array for negative id', async () => {
      const servers = await MCPServer.getById.call({ db }, -1);
      expect(servers).toEqual([]);
    });
  });

  describe('database constraints', () => {
    it('should not allow null name', async () => {
      await expect(
        db.insert(mcpServersTable).values({
          name: null as any,
          serverConfig: createMockServerConfig(),
        })
      ).rejects.toThrow();
    });

    it('should not allow null serverConfig', async () => {
      await expect(
        db.insert(mcpServersTable).values({
          name: 'test-server',
          serverConfig: null as any,
        })
      ).rejects.toThrow();
    });

    it('should auto-generate timestamps', async () => {
      const before = new Date();

      const created = await MCPServer.create.call({ db }, createMockMcpServer());

      const after = new Date();

      expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent creates with unique names', async () => {
      const creates = Array.from({ length: 5 }, (_, i) =>
        MCPServer.create.call(
          { db },
          {
            name: `concurrent-server-${i}`,
            serverConfig: createMockServerConfig(),
          }
        )
      );

      const results = await Promise.all(creates);

      expect(results).toHaveLength(5);
      const names = results.map((r) => r.name);
      expect(new Set(names).size).toBe(5); // All unique
    });
  });

  describe('edge cases', () => {
    it('should handle very long server names', async () => {
      const longName = 'a'.repeat(255);

      const created = await MCPServer.create.call(
        { db },
        {
          name: longName,
          serverConfig: createMockServerConfig(),
        }
      );

      expect(created.name).toBe(longName);
    });

    it('should handle special characters in names', async () => {
      const specialName = 'test-server_123!@#$%^&*()';

      const created = await MCPServer.create.call(
        { db },
        {
          name: specialName,
          serverConfig: createMockServerConfig(),
        }
      );

      expect(created.name).toBe(specialName);
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

      const created = await MCPServer.create.call(
        { db },
        {
          name: 'unicode-server',
          serverConfig: unicodeConfig,
        }
      );

      expect(created.serverConfig).toEqual(unicodeConfig);
    });
  });
});