import { ErrorResponseSchema, McpServerConfigSchema, McpServerUserConfigValuesSchema } from '@archestra/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import McpServerModel, { selectMcpServerSchema } from '@backend/models/mcpServer';

const mcpServerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/mcp_server',
    {
      schema: {
        operationId: 'getMcpServers',
        description: 'Get all installed MCP servers',
        tags: ['MCP Server'],
        response: {
          200: z.array(selectMcpServerSchema),
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
          200: selectMcpServerSchema,
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
          200: selectMcpServerSchema,
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
};

export default mcpServerRoutes;
