import { FastifyPluginAsync } from 'fastify';

import { MCPServer as MCPServerModel } from '@backend/models/mcpServer';
import { MCPServer } from '@types';

// Request/Response types
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
  fastify.get<{
    Reply: MCPServer[];
  }>(
    '/api/mcp_server',
    {
      schema: {
        operationId: 'getMcpServers',
        description: 'Get all installed MCP servers',
        tags: ['MCP Server'],
        response: {
          200: {
            description: 'List of installed MCP servers',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                config: {
                  type: 'object',
                  properties: {
                    command: { type: 'string' },
                    args: { type: 'array', items: { type: 'string' } },
                    env: { type: 'object' },
                    transport: { type: 'string' },
                  },
                  required: ['command'],
                },
                tools: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      inputSchema: { type: 'object' },
                    },
                    required: ['name'],
                  },
                },
              },
              required: ['name', 'config'],
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const servers = await MCPServerModel.getInstalledMcpServers();
        return reply.send(servers);
      } catch (error) {
        console.error('Failed to load installed MCP servers:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Install MCP server (from catalog)
   */
  fastify.post<{
    Body: InstallRequestBody;
    Reply: { success: boolean };
  }>(
    '/api/mcp_server/install',
    {
      schema: {
        operationId: 'installMcpServer',
        description: 'Install MCP server from catalog',
        tags: ['MCP Server'],
        body: {
          type: 'object',
          properties: {
            mcp_connector_id: { type: 'string' },
          },
          required: ['mcp_connector_id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { mcp_connector_id } = request.body;

        if (!mcp_connector_id) {
          return reply.code(400).send({ error: 'mcp_connector_id is required' });
        }

        await MCPServerModel.saveMcpServerFromCatalog(mcp_connector_id);
        return reply.code(200).send({ success: true });
      } catch (error: any) {
        console.error('Failed to install MCP server from catalog:', error);

        if (error.message?.includes('not found in catalog')) {
          return reply.code(404).send({ error: error.message });
        }

        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Uninstall MCP server
   */
  fastify.delete<{
    Params: UninstallParams;
    Reply: { success: boolean };
  }>(
    '/api/mcp_server/:mcp_server_name',
    {
      schema: {
        operationId: 'uninstallMcpServer',
        description: 'Uninstall MCP server',
        tags: ['MCP Server'],
        params: {
          type: 'object',
          properties: {
            mcp_server_name: { type: 'string' },
          },
          required: ['mcp_server_name'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { mcp_server_name } = request.params;

        if (!mcp_server_name) {
          return reply.code(400).send({ error: 'mcp_server_name is required' });
        }

        await MCPServerModel.uninstallMcpServer(mcp_server_name);
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
    Reply: { auth_url: string };
  }>(
    '/api/mcp_server/start_oauth',
    {
      schema: {
        operationId: 'startMcpServerOauth',
        description: 'Start MCP server OAuth flow',
        tags: ['MCP Server'],
        body: {
          type: 'object',
          properties: {
            mcp_connector_id: { type: 'string' },
          },
          required: ['mcp_connector_id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              auth_url: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
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
    }
  );
};

export default mcpServerRoutes;
