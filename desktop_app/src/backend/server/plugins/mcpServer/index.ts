import { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod/v4';

import McpServerModel, { selectMcpServerSchema } from '@backend/models/mcpServer';

// Request schemas
const installFromCatalogRequestSchema = z.object({
  catalogSlug: z.string(),
  userConfigValues: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
});

const installCustomRequestSchema = z.object({
  name: z.string(),
  serverConfig: z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()),
  }),
});

const startOAuthRequestSchema = z.object({
  catalogSlug: z.string(),
});

// Response schemas
const mcpServerResponseSchema = selectMcpServerSchema;
const mcpServersListResponseSchema = z.array(mcpServerResponseSchema);
const successResponseSchema = z.object({ success: z.boolean() });
const errorResponseSchema = z.object({ error: z.string() });
const authUrlResponseSchema = z.object({ authUrl: z.string() });

// Request params schemas
const uninstallParamsSchema = z.object({
  slug: z.string(),
});

// Type exports
type InstallFromCatalogRequestBody = z.infer<typeof installFromCatalogRequestSchema>;
type InstallCustomRequestBody = z.infer<typeof installCustomRequestSchema>;
type StartOAuthRequestBody = z.infer<typeof startOAuthRequestSchema>;
type UninstallParams = z.infer<typeof uninstallParamsSchema>;

const mcpServerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all installed MCP servers
   */
  fastify.get(
    '/api/mcp_server',
    {
      schema: {
        operationId: 'getMcpServers',
        description: 'Get all installed MCP servers',
        tags: ['MCP Server'],
        response: {
          200: zodToJsonSchema(mcpServersListResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      try {
        const servers = await McpServerModel.getInstalledMcpServers();
        return reply.send(servers);
      } catch (error) {
        console.error('Failed to load installed MCP servers:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Install MCP server from catalog
   */
  fastify.post<{
    Body: InstallFromCatalogRequestBody;
  }>(
    '/api/mcp_server/install',
    {
      schema: {
        operationId: 'installMcpServer',
        description: 'Install MCP server from catalog',
        tags: ['MCP Server'],
        body: zodToJsonSchema(installFromCatalogRequestSchema as any),
        response: {
          200: zodToJsonSchema(mcpServerResponseSchema as any),
          400: zodToJsonSchema(errorResponseSchema as any),
          404: zodToJsonSchema(errorResponseSchema as any),
          500: zodToJsonSchema(errorResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      try {
        const { catalogSlug, userConfigValues } = request.body;

        if (!catalogSlug) {
          return reply.code(400).send({ error: 'catalogSlug is required' });
        }

        const server = await McpServerModel.saveMcpServerFromCatalog(catalogSlug, userConfigValues);
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

  /**
   * Install custom MCP server
   */
  fastify.post<{
    Body: InstallCustomRequestBody;
  }>(
    '/api/mcp_server/install_custom',
    {
      schema: {
        operationId: 'installCustomMcpServer',
        description: 'Install custom MCP server',
        tags: ['MCP Server'],
        body: zodToJsonSchema(installCustomRequestSchema as any),
        response: {
          200: zodToJsonSchema(mcpServerResponseSchema as any),
          400: zodToJsonSchema(errorResponseSchema as any),
          500: zodToJsonSchema(errorResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      try {
        const { name, serverConfig } = request.body;

        if (!name || !serverConfig) {
          return reply.code(400).send({ error: 'name and serverConfig are required' });
        }

        const server = await McpServerModel.saveCustomMcpServer(name, serverConfig);
        return reply.code(200).send(server);
      } catch (error: any) {
        console.error('Failed to install custom MCP server:', error);

        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Uninstall MCP server
   */
  fastify.delete<{
    Params: UninstallParams;
  }>(
    '/api/mcp_server/:slug',
    {
      schema: {
        operationId: 'uninstallMcpServer',
        description: 'Uninstall MCP server',
        tags: ['MCP Server'],
        params: zodToJsonSchema(uninstallParamsSchema as any),
        response: {
          200: zodToJsonSchema(successResponseSchema as any),
          400: zodToJsonSchema(errorResponseSchema as any),
          500: zodToJsonSchema(errorResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      try {
        const { slug } = request.params;

        if (!slug) {
          return reply.code(400).send({ error: 'slug is required' });
        }

        await McpServerModel.uninstallMcpServer(slug);
        return reply.code(200).send({ success: true });
      } catch (error) {
        console.error('Failed to uninstall MCP server:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Start MCP server OAuth flow
   */
  fastify.post<{
    Body: StartOAuthRequestBody;
  }>(
    '/api/mcp_server/start_oauth',
    {
      schema: {
        operationId: 'startMcpServerOauth',
        description: 'Start MCP server OAuth flow',
        tags: ['MCP Server'],
        body: zodToJsonSchema(startOAuthRequestSchema as any),
        response: {
          200: zodToJsonSchema(authUrlResponseSchema as any),
          400: zodToJsonSchema(errorResponseSchema as any),
          500: zodToJsonSchema(errorResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      try {
        const { catalogSlug } = request.body;

        if (!catalogSlug) {
          return reply.code(400).send({ error: 'catalogSlug is required' });
        }

        // TODO: Implement OAuth flow with the oauth proxy service
        return reply.send({ authUrl: `https://oauth-proxy.archestra.ai/auth/${catalogSlug}` });
      } catch (error) {
        console.error('Failed to start MCP server OAuth:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default mcpServerRoutes;
