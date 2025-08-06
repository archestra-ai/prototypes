import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import McpServerModel from '@backend/models/mcpServer';

export const createArchestraMcpServer = (): Server => {
  const archestraMcpServer = new McpServer({
    name: 'archestra-server',
    version: '1.0.0',
  });

  archestraMcpServer.tool(
    'list_installed_mcp_servers',
    {
      title: 'List Installed MCP Servers',
      description: 'List all installed MCP servers',
      inputSchema: {},
    },
    async (args, extra) => {
      try {
        const servers = await McpServerModel.getInstalledMcpServers();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(servers, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([], null, 2),
            },
          ],
        };
      }
    }
  );

  archestraMcpServer.tool(
    'install_mcp_server',
    {
      title: 'Install MCP Server',
      description: 'Install an MCP server',
      inputSchema: { slug: z.string({ description: 'The slug of the MCP server to install' }) },
    },
    async (args, extra) => {
      try {
        const { slug } = args;
        const server = await McpServerModel.getBySlug(slug);
        if (!server) {
          return {
            content: [
              {
                type: 'text',
                text: `MCP server with slug ${slug} not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(server, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([], null, 2),
            },
          ],
        };
      }
    }
  );

  archestraMcpServer.tool(
    'uninstall_mcp_server',
    {
      title: 'Uninstall MCP Server',
      description: 'Uninstall an MCP server',
      inputSchema: { slug: z.string({ description: 'The slug of the MCP server to uninstall' }) },
    },
    async (args, extra) => {
      try {
        const { slug } = args;

        await McpServerModel.uninstallMcpServer(slug);

        return {
          content: [
            {
              type: 'text',
              text: `MCP server with slug ${slug} uninstalled`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([], null, 2),
            },
          ],
        };
      }
    }
  );

  return archestraMcpServer.server;
};
