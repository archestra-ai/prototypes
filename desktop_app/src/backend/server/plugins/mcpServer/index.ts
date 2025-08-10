import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import McpServerModel, {
  McpServerConfigSchema,
  McpServerContainerLogsSchema,
  McpServerSchema,
  McpServerUserConfigValuesSchema,
} from '@backend/models/mcpServer';
import { McpServerSandboxManager } from '@backend/sandbox';
import { ErrorResponseSchema } from '@backend/schemas';

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(McpServerSchema, { id: 'McpServer' });
z.globalRegistry.add(McpServerContainerLogsSchema, { id: 'McpServerContainerLogs' });

const mcpServerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/mcp_server',
    {
      schema: {
        operationId: 'getMcpServers',
        description: 'Get all installed MCP servers',
        tags: ['MCP Server'],
        response: {
          200: z.array(McpServerSchema),
        },
      },
    },
    async (_request, reply) => {
      const servers = await McpServerModel.getInstalledMcpServers();
      return reply.send(servers);
    }
  );

  fastify.post(
    '/api/mcp_server/install',
    {
      schema: {
        operationId: 'installMcpServer',
        description: 'Install MCP server from catalog',
        tags: ['MCP Server'],
        body: z.object({
          catalogName: z.string(),
          userConfigValues: McpServerUserConfigValuesSchema,
        }),
        response: {
          200: McpServerSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async ({ body: { catalogName, userConfigValues } }, reply) => {
      try {
        const server = await McpServerModel.saveMcpServerFromCatalog(catalogName, userConfigValues);
        return reply.code(200).send(server);
      } catch (error: any) {
        console.error('Failed to install MCP server from catalog:', error);

        if (error.message?.includes('not found in catalog')) {
          return reply.code(404).send({ error: error.message });
        }

        if (error.message?.includes('already installed')) {
          return reply.code(400).send({ error: error.message });
        }

        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.post(
    '/api/mcp_server/install_custom',
    {
      schema: {
        operationId: 'installCustomMcpServer',
        description: 'Install custom MCP server',
        tags: ['MCP Server'],
        body: z.object({
          name: z.string(),
          serverConfig: McpServerConfigSchema,
        }),
        response: {
          200: McpServerSchema,
        },
      },
    },
    async ({ body: { name, serverConfig } }, reply) => {
      const server = await McpServerModel.saveCustomMcpServer(name, serverConfig);
      return reply.code(200).send(server);
    }
  );

  fastify.delete(
    '/api/mcp_server/:id',
    {
      schema: {
        operationId: 'uninstallMcpServer',
        description: 'Uninstall MCP server',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    async ({ params: { id } }, reply) => {
      await McpServerModel.uninstallMcpServer(id);
      return reply.code(200).send({ success: true });
    }
  );

  fastify.post(
    '/api/mcp_server/start_oauth',
    {
      schema: {
        operationId: 'startMcpServerOauth',
        description: 'Start MCP server OAuth flow',
        tags: ['MCP Server'],
        body: z.object({
          catalogName: z.string(),
        }),
        response: {
          200: z.object({ authUrl: z.string() }),
        },
      },
    },
    async ({ body: { catalogName } }, reply) => {
      return reply.send({ authUrl: `https://oauth-proxy.archestra.ai/auth/${catalogName}` });
    }
  );

  /**
   * Relevant docs:
   *
   * Fastify reply.hijack() docs: https://fastify.dev/docs/latest/Reference/Reply/#hijack
   * Excluding a route from the openapi spec: https://stackoverflow.com/questions/73950993/fastify-swagger-exclude-certain-routes
   */
  fastify.post(
    '/mcp_proxy/:id',
    {
      schema: {
        hide: true,
        description: 'Proxy requests to the containerized MCP server running in the Archestra.ai sandbox',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        body: z.any(),
      },
    },
    async ({ params: { id }, body }, reply) => {
      const mcpServer = await McpServerModel.getById(id);
      if (!mcpServer) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }

      try {
        fastify.log.info(`🚀 Proxying request to MCP server ${id}:`, JSON.stringify(body));

        // 🎯 Check if container exists BEFORE hijacking! 🎯
        const containerExists = McpServerSandboxManager.checkContainerExists(id);

        if (!containerExists) {
          // Container not ready yet, return 404 so UI can retry
          fastify.log.info(`Container ${id} not ready yet, returning 404`);
          return reply.code(404).send({
            error: 'MCP server container not ready yet',
            retry: true,
          });
        }

        // 🚀 Now hijack the response to handle streaming manually! 🚀
        reply.hijack();

        // 🔥 Set up streaming response headers! 🔥
        reply.raw.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // 🎯 Stream the request to the container! 🎯
        await McpServerSandboxManager.streamToMcpServerContainer(id, body, reply.raw);

        // Return undefined when hijacking to prevent Fastify from sending response
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : 'No stack trace';

        fastify.log.error(`Error proxying to MCP server ${id}: ${errorMessage}`);
        fastify.log.error(`Error stack trace: ${errorStack}`);

        // If we haven't sent yet, we can still send error response
        if (!reply.sent) {
          return reply.code(500).send({
            error: error instanceof Error ? error.message : 'Failed to proxy request to MCP server',
          });
        } else if (!reply.raw.headersSent) {
          // If already hijacked, try to write error to raw response
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
          reply.raw.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to proxy request to MCP server',
            })
          );
        }
      }
    }
  );

  fastify.get(
    '/mcp_proxy/:id/logs',
    {
      schema: {
        operationId: 'getMcpServerLogs',
        description: 'Get logs for a specific MCP server container',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        querystring: z.object({
          lines: z.coerce.number().optional().default(100),
        }),
        response: {
          200: McpServerContainerLogsSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id }, query: { lines } }, reply) => {
      const mcpServer = await McpServerModel.getById(id);
      if (!mcpServer) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }

      try {
        const logs = await McpServerSandboxManager.getMcpServerLogs(id, lines);
        return reply.send(logs);
      } catch (error) {
        fastify.log.error(`Error getting logs for MCP server ${id}:`, error);
        return reply.code(404).send({
          error: error instanceof Error ? error.message : 'Failed to get logs',
        });
      }
    }
  );
};

export default mcpServerRoutes;
