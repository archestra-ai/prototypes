import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import ExternalMcpClientModel, {
  ExternalMcpClientNameSchema,
  ExternalMcpClientSelectSchema,
} from '@backend/models/externalMcpClient';

const externalMcpClientRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/external_mcp_client',
    {
      schema: {
        operationId: 'getConnectedExternalMcpClients',
        description: 'Get all connected external MCP clients',
        tags: ['External MCP Client'],
        response: {
          200: z.array(ExternalMcpClientSelectSchema),
        },
      },
    },
    async (_request, reply) => {
      const clients = await ExternalMcpClientModel.getConnectedExternalMcpClients();
      return reply.send(clients);
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
