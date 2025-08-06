import { FastifyPluginAsync } from 'fastify';

import { ExternalMcpClientName } from '@archestra/types';
import ExternalMcpClientModel from '@backend/models/externalMcpClient';

interface ConnectRequestBody {
  client_name: ExternalMcpClientName;
}

interface DisconnectParams {
  client_name: ExternalMcpClientName;
}

const externalMcpClientRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all connected external MCP clients
   */
  fastify.get(
    '/api/external_mcp_client',
    {
      schema: {
        operationId: 'getConnectedExternalMcpClients',
        description: 'Get all connected external MCP clients',
        tags: ['External MCP Client'],
      },
    },
    async (request, reply) => {
      try {
        const clients = await ExternalMcpClientModel.getConnectedExternalMcpClients();
        return reply.send(clients);
      } catch (error) {
        console.error('Failed to get connected external MCP clients:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get supported external MCP client names
   */
  fastify.get(
    '/api/external_mcp_client/supported',
    {
      schema: {
        operationId: 'getSupportedExternalMcpClients',
        description: 'Get supported external MCP client names',
        tags: ['External MCP Client'],
      },
    },
    async (request, reply) => {
      try {
        const supportedClients = ExternalMcpClientModel.getSupportedExternalMcpClients();
        return reply.send(supportedClients);
      } catch (error) {
        console.error('Failed to get supported external MCP clients:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Connect an external MCP client
   */
  fastify.post<{ Body: ConnectRequestBody }>(
    '/api/external_mcp_client/connect',
    {
      schema: {
        operationId: 'connectExternalMcpClient',
        description: 'Connect an external MCP client',
        tags: ['External MCP Client'],
      },
    },
    async (request, reply) => {
      try {
        const { client_name } = request.body;

        if (!Object.values(ExternalMcpClientName).includes(client_name)) {
          return reply.code(400).send({ error: 'Invalid client name' });
        }

        await ExternalMcpClientModel.connectExternalMcpClient(client_name);
        return reply.code(200).send({ success: true });
      } catch (error) {
        console.error('Failed to connect external MCP client:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Disconnect an external MCP client
   */
  fastify.delete<{ Params: DisconnectParams }>(
    '/api/external_mcp_client/:client_name/disconnect',
    {
      schema: {
        operationId: 'disconnectExternalMcpClient',
        description: 'Disconnect an external MCP client',
        tags: ['External MCP Client'],
      },
    },
    async (request, reply) => {
      try {
        const { client_name } = request.params;

        if (!Object.values(ExternalMcpClientName).includes(client_name)) {
          return reply.code(400).send({ error: 'Invalid client name' });
        }

        await ExternalMcpClientModel.disconnectExternalMcpClient(client_name);
        return reply.code(200).send({ success: true });
      } catch (error) {
        console.error('Failed to disconnect external MCP client:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default externalMcpClientRoutes;
