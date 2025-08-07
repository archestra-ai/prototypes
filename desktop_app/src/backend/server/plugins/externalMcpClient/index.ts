import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import ExternalMcpClientModel, {
  ExternalMcpClientNameSchema,
  ExternalMcpClientSchema,
} from '@backend/models/externalMcpClient';

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(ExternalMcpClientSchema, { id: 'ExternalMcpClient' });
z.globalRegistry.add(ExternalMcpClientNameSchema, { id: 'ExternalMcpClientName' });

const externalMcpClientRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/external_mcp_client',
    {
      schema: {
        operationId: 'getConnectedExternalMcpClients',
        description: 'Get all connected external MCP clients',
        tags: ['External MCP Client'],
        response: {
          200: z.array(ExternalMcpClientSchema),
        },
      },
    },
    async (_request, reply) => {
      const clients = await ExternalMcpClientModel.getConnectedExternalMcpClients();
      return reply.send(clients);
    }
  );

  fastify.get(
    '/api/external_mcp_client/supported',
    {
      schema: {
        operationId: 'getSupportedExternalMcpClients',
        description: 'Get supported external MCP client names',
        tags: ['External MCP Client'],
        response: {
          200: z.array(ExternalMcpClientNameSchema),
        },
      },
    },
    async (_request, reply) => {
      return reply.send(ExternalMcpClientNameSchema.options);
    }
  );

  fastify.post(
    '/api/external_mcp_client/connect',
    {
      schema: {
        operationId: 'connectExternalMcpClient',
        description: 'Connect an external MCP client',
        tags: ['External MCP Client'],
        body: z.object({
          client_name: ExternalMcpClientNameSchema,
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async ({ body: { client_name } }, reply) => {
      await ExternalMcpClientModel.connectExternalMcpClient(client_name);
      return reply.code(200).send({ success: true });
    }
  );

  fastify.delete(
    '/api/external_mcp_client/:client_name/disconnect',
    {
      schema: {
        operationId: 'disconnectExternalMcpClient',
        description: 'Disconnect an external MCP client',
        tags: ['External MCP Client'],
        params: z.object({
          client_name: ExternalMcpClientNameSchema,
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async ({ params: { client_name } }, reply) => {
      await ExternalMcpClientModel.disconnectExternalMcpClient(client_name);
      return reply.code(200).send({ success: true });
    }
  );
};

export default externalMcpClientRoutes;
