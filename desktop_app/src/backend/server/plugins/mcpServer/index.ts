import { FastifyPluginAsync } from 'fastify';

import { MCPServer } from '@backend/models/mcpServer';

interface InstallRequestBody {
  mcp_connector_id: string;
}

interface StartOAuthRequestBody {
  mcp_connector_id: string;
}

interface UninstallParams {
  mcp_server_name: string;
}

const mcpServerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all installed MCP servers
   */
  fastify.get('/api/mcp_server', async (request, reply) => {
    try {
      const servers = await MCPServer.getInstalledMcpServers();
      return reply.send(servers);
    } catch (error) {
      console.error('Failed to load installed MCP servers:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get MCP connector catalog
   */
  fastify.get('/api/mcp_server/catalog', async (request, reply) => {
    try {
      return reply.send(MCPServer.getMcpConnectorCatalog());
    } catch (error) {
      console.error('Failed to get MCP connector catalog:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Install MCP server from catalog
   */
  fastify.post<{ Body: InstallRequestBody }>('/api/mcp_server/catalog/install', async (request, reply) => {
    try {
      const { mcp_connector_id } = request.body;

      if (!mcp_connector_id) {
        return reply.code(400).send({ error: 'mcp_connector_id is required' });
      }

      await MCPServer.saveMcpServerFromCatalog(mcp_connector_id);
      return reply.code(200).send({ success: true });
    } catch (error: any) {
      console.error('Failed to install MCP server from catalog:', error);

      if (error.message?.includes('not found in catalog')) {
        return reply.code(404).send({ error: error.message });
      }

      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Start MCP server OAuth flow
   */
  fastify.post<{ Body: StartOAuthRequestBody }>('/api/mcp_server/start_oauth', async (request, reply) => {
    try {
      const { mcp_connector_id } = request.body;

      if (!mcp_connector_id) {
        return reply.code(400).send({ error: 'mcp_connector_id is required' });
      }

      // TODO: Implement OAuth flow with the oauth proxy service
      const authUrl = `https://oauth-proxy.archestra.ai/auth/${mcp_connector_id}`;

      return reply.send({ auth_url: authUrl });
    } catch (error) {
      console.error('Failed to start MCP server OAuth:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Uninstall MCP server
   */
  fastify.delete<{ Params: UninstallParams }>('/api/mcp_server/:mcp_server_name', async (request, reply) => {
    try {
      const { mcp_server_name } = request.params;

      if (!mcp_server_name) {
        return reply.code(400).send({ error: 'mcp_server_name is required' });
      }

      await MCPServer.uninstallMcpServer(mcp_server_name);
      return reply.code(200).send({ success: true });
    } catch (error) {
      console.error('Failed to uninstall MCP server:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
};

export default mcpServerRoutes;
