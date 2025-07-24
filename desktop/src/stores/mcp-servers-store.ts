import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequest, ClientCapabilities, Tool } from '@modelcontextprotocol/sdk/types.js';
import { fetch } from '@tauri-apps/plugin-http';
import { create } from 'zustand';

import { ARCHESTRA_SERVER_MCP_PROXY_URL, ARCHESTRA_SERVER_MCP_URL } from '@/consts';
import { type McpServer, type McpServerDefinition, getInstalledMcpServers } from '@/lib/api-client';

import type { ConnectedMCPServer } from '../types';

export type MCPServerTools = Record<string, Tool[]>;

interface MCPServersState {
  archestraMCPServer: ConnectedMCPServer;
  installedMCPServers: ConnectedMCPServer[];
  loadingInstalledMCPServers: boolean;
  errorLoadingInstalledMCPServers: string | null;
}

interface MCPServersActions {
  addMCPServerToInstalledMCPServers: (mcpServer: McpServerDefinition) => void;
  removeMCPServerFromInstalledMCPServers: (mcpServerName: string) => void;
  executeTool: (serverName: string, request: CallToolRequest['params']) => Promise<any>;
  loadInstalledMCPServers: () => Promise<void>;
  connectToArchestraMCPServer: () => Promise<void>;
  connectToMCPServer: (serverName: string, url: string) => Promise<Client | null>;
  allAvailableTools: () => MCPServerTools;
}

type MCPServersStore = MCPServersState & MCPServersActions;

export function constructProxiedMCPServerUrl(mcpServerName: string) {
  return `${ARCHESTRA_SERVER_MCP_PROXY_URL}/${mcpServerName}`;
}

const configureMCPClient = async (
  clientName: string,
  clientUrl: string,
  clientCapabilities: ClientCapabilities
): Promise<Client | null> => {
  const client = new Client(
    {
      name: clientName,
      version: '1.0.0',
    },
    {
      capabilities: clientCapabilities,
    }
  );

  const transport = new StreamableHTTPClientTransport(new URL(clientUrl), {
    fetch: fetch,
  });

  await client.connect(transport);

  return client;
};

export const useMCPServersStore = create<MCPServersStore>((set, get) => ({
  // State
  archestraMCPServer: {
    name: 'Archestra',
    /**
     * server_config and meta aren't needed for the Archestra MCP server, they're simply added
     * here to appease the ConnectedMCPServer type.
     */
    server_config: {
      transport: 'http',
      command: '',
      args: [],
      env: {},
    },
    meta: undefined,
    url: ARCHESTRA_SERVER_MCP_URL,
    client: null,
    tools: [],
    status: 'connecting',
    error: undefined,
  },
  installedMCPServers: [],
  loadingInstalledMCPServers: false,
  errorLoadingInstalledMCPServers: null,

  // Actions
  addMCPServerToInstalledMCPServers: (mcpServer: McpServerDefinition) => {
    set((state) => ({
      installedMCPServers: [
        ...state.installedMCPServers,
        {
          ...mcpServer,
          tools: [],
          url: constructProxiedMCPServerUrl(mcpServer.name),
          status: 'connecting',
          error: undefined,
          client: null,
        },
      ],
    }));

    // Connect to the newly added server
    const newServer = get().installedMCPServers.find((s) => s.name === mcpServer.name);
    if (newServer) {
      get().connectToMCPServer(newServer.name, newServer.url);
    }
  },

  removeMCPServerFromInstalledMCPServers: (mcpServerName: string) => {
    // Close the client connection before removing
    const server = get().installedMCPServers.find((s) => s.name === mcpServerName);
    if (server?.client) {
      server.client.close();
    }

    set((state) => ({
      installedMCPServers: state.installedMCPServers.filter((mcpServer) => mcpServer.name !== mcpServerName),
    }));
  },

  executeTool: async (serverName: string, toolCallRequest: CallToolRequest['params']) => {
    const { archestraMCPServer, installedMCPServers } = get();

    let client: Client | null = null;
    if (serverName === 'archestra') {
      client = archestraMCPServer.client;
    } else {
      const server = installedMCPServers.find((s) => s.name === serverName);
      client = server?.client || null;
    }

    if (!client) {
      throw new Error(`No connection to server ${serverName}`);
    }

    try {
      const result = await client.callTool(toolCallRequest);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool ${toolCallRequest.name} on ${serverName}:`, error);
      throw error;
    }
  },

  loadInstalledMCPServers: async () => {
    try {
      set({
        loadingInstalledMCPServers: true,
        errorLoadingInstalledMCPServers: null,
      });

      const response = await getInstalledMcpServers();

      if ('data' in response && response.data) {
        // Convert from generated type to internal McpServerDefinition type
        const installedMCPServers = response.data.map(
          (server: McpServer): McpServerDefinition => ({
            name: server.name,
            server_config: JSON.parse(server.server_config),
            meta: server.meta ? JSON.parse(server.meta) : undefined,
          })
        );

        // Add servers and connect to them
        for (const server of installedMCPServers) {
          get().addMCPServerToInstalledMCPServers(server);
        }
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      set({ errorLoadingInstalledMCPServers: error as string });
    } finally {
      set({ loadingInstalledMCPServers: false });
    }
  },

  connectToArchestraMCPServer: async () => {
    try {
      const client = await configureMCPClient('Archestra-client', ARCHESTRA_SERVER_MCP_URL, { tools: {} });

      if (client) {
        const { tools } = await client.listTools();

        set((state) => ({
          archestraMCPServer: {
            ...state.archestraMCPServer,
            client,
            tools,
            status: 'connected',
            error: undefined,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to connect to Archestra MCP server:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      set((state) => ({
        archestraMCPServer: {
          ...state.archestraMCPServer,
          status: 'error',
          error: errorMessage,
        },
      }));
    }
  },

  connectToMCPServer: async (serverName: string, url: string) => {
    if (!url) {
      console.error(`No URL provided for MCP server ${serverName}`);
      set((state) => ({
        installedMCPServers: state.installedMCPServers.map((server) =>
          server.name === serverName
            ? {
                ...server,
                client: null,
                status: 'error',
                error: 'No URL configured',
              }
            : server
        ),
      }));
      return null;
    }

    try {
      const client = await configureMCPClient(`${serverName}-client`, url, {
        tools: {},
      });

      if (!client) {
        return null;
      }

      // List available tools
      const { tools } = await client.listTools();

      set((state) => ({
        installedMCPServers: state.installedMCPServers.map((server) =>
          server.name === serverName ? { ...server, client, tools, status: 'connected' } : server
        ),
      }));

      return client;
    } catch (error) {
      // Extract more detailed error information
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('HTTP 500')) {
          errorMessage = `Server error (500) - possible JSON-RPC format issue`;
        }
      }

      set((state) => ({
        installedMCPServers: state.installedMCPServers.map((server) =>
          server.name === serverName
            ? {
                ...server,
                client: null,
                status: 'error',
                error: errorMessage,
              }
            : server
        ),
      }));
      return null;
    }
  },

  allAvailableTools: () => {
    const { installedMCPServers } = get();
    return installedMCPServers.reduce((acc, server) => {
      acc[server.name] = server.tools;
      return acc;
    }, {} as MCPServerTools);
  },
}));

// Initialize connections on store creation
useMCPServersStore.getState().connectToArchestraMCPServer();
useMCPServersStore.getState().loadInstalledMCPServers();

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = useMCPServersStore.getState();
    store.archestraMCPServer.client?.close();
    store.installedMCPServers.forEach((server) => server.client?.close());
  });
}
