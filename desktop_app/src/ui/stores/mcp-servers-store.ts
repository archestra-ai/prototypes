import { Client } from '@modelcontextprotocol/sdk/client/index';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { CallToolRequest, ClientCapabilities } from '@modelcontextprotocol/sdk/types';
import { create } from 'zustand';

import { getMcpServers, installMcpServer, startMcpServerOauth, uninstallMcpServer } from '@clients/archestra/api/gen';
import { type McpServer as McpServerCatalogEntry, getSearch as searchCatalog } from '@clients/archestra/catalog/gen';
import { ConnectedMCPServer, MCPServer, MCPServerStatus, MCPServerToolsMap, ToolWithMCPServerName } from '@types';
import config from '@ui/config';
import { getToolsGroupedByServer } from '@ui/lib/utils/mcp-server';
import { formatToolName } from '@ui/lib/utils/tools';

const ARCHESTRA_MCP_SERVER_NAME = 'archestra';

interface MCPServersState {
  archestraMCPServer: ConnectedMCPServer | null;

  installedMCPServers: ConnectedMCPServer[];
  loadingInstalledMCPServers: boolean;
  errorLoadingInstalledMCPServers: string | null;

  connectorCatalog: McpServerCatalogEntry[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;

  installingMCPServerName: string | null;
  errorInstallingMCPServer: string | null;

  uninstallingMCPServerName: string | null;
  errorUninstallingMCPServer: string | null;

  selectedTools: ToolWithMCPServerName[];
  toolSearchQuery: string;
}

interface MCPServersActions {
  loadInstalledMCPServers: () => Promise<void>;
  addMCPServerToInstalledMCPServers: (mcpServer: MCPServer) => void;
  removeMCPServerFromInstalledMCPServers: (mcpServerName: string) => void;

  loadConnectorCatalog: () => Promise<void>;
  installMCPServerFromConnectorCatalog: (mcpServer: McpServerCatalogEntry) => Promise<void>;
  uninstallMCPServer: (mcpServerName: string) => Promise<void>;

  connectToArchestraMCPServer: () => Promise<void>;
  connectToMCPServer: (serverName: string, url: string) => Promise<Client | null>;

  executeTool: (serverName: string, request: CallToolRequest['params']) => Promise<any>;
  getAllAvailableTools: () => ToolWithMCPServerName[];
  getFilteredTools: () => ToolWithMCPServerName[];
  getAllAvailableToolsGroupedByServer: () => MCPServerToolsMap;
  getFilteredToolsGroupedByServer: () => MCPServerToolsMap;

  addSelectedTool: (tool: ToolWithMCPServerName) => void;
  removeSelectedTool: (tool: ToolWithMCPServerName) => void;

  setToolSearchQuery: (query: string) => void;
}

type MCPServersStore = MCPServersState & MCPServersActions;

export function constructProxiedMCPServerUrl(mcpServerName: string) {
  return `${config.archestra.mcpProxyUrl}/${mcpServerName}`;
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

  const transport = new StreamableHTTPClientTransport(new URL(clientUrl));

  await client.connect(transport);

  return client;
};

const initializeConnectedMCPServerTools = async (
  client: Client,
  serverName: string
): Promise<ToolWithMCPServerName[]> => {
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    ...tool,
    serverName,
    enabled: true,
  }));
};

export const useMCPServersStore = create<MCPServersStore>((set, get) => ({
  // State
  archestraMCPServer: null,

  installedMCPServers: [],
  loadingInstalledMCPServers: false,
  errorLoadingInstalledMCPServers: null,

  connectorCatalog: [],
  loadingConnectorCatalog: false,
  errorFetchingConnectorCatalog: null,

  installingMCPServerName: null,
  errorInstallingMCPServer: null,

  uninstallingMCPServerName: null,
  errorUninstallingMCPServer: null,

  selectedTools: [],
  toolSearchQuery: '',

  // Actions
  loadInstalledMCPServers: async () => {
    try {
      set({
        loadingInstalledMCPServers: true,
        errorLoadingInstalledMCPServers: null,
      });

      const response = await getMcpServers();

      if ('data' in response && response.data) {
        // Add servers and connect to them
        for (const server of response.data) {
          get().addMCPServerToInstalledMCPServers(server);
        }
      } else if ('error' in response) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ errorLoadingInstalledMCPServers: errorMessage });
    } finally {
      set({ loadingInstalledMCPServers: false });
    }
  },

  addMCPServerToInstalledMCPServers: (mcpServer: MCPServer) => {
    set((state) => ({
      installedMCPServers: [
        ...state.installedMCPServers,
        {
          ...mcpServer,
          tools: [],
          url: constructProxiedMCPServerUrl(mcpServer.name),
          status: MCPServerStatus.Connecting,
          error: null,
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

  loadConnectorCatalog: async () => {
    try {
      set({
        loadingConnectorCatalog: true,
        errorFetchingConnectorCatalog: null,
      });

      const response = await searchCatalog();

      if ('data' in response && response.data) {
        // Type assertion since the API doesn't return proper types yet
        const entries = response.data as McpServerCatalogEntry[];
        set({
          connectorCatalog: entries,
        });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      set({ errorFetchingConnectorCatalog: error as string });
    } finally {
      set({ loadingConnectorCatalog: false });
    }
  },

  installMCPServerFromConnectorCatalog: async (mcpServer: McpServerCatalogEntry) => {
    const { oauth, title, id } = mcpServer;

    try {
      set({
        installingMCPServerName: mcpServer.title,
        errorInstallingMCPServer: null,
      });

      // Check if OAuth is required
      if (oauth?.required) {
        try {
          // Start OAuth flow
          const response = await startMcpServerOauth({
            body: { mcp_connector_id: id },
          });

          if ('data' in response && response.data) {
            // For OAuth connectors, the backend will handle the installation after successful auth
            alert(`OAuth setup started for ${title}. Please complete the authentication in your browser.`);
          } else if ('error' in response) {
            throw new Error(response.error as string);
          }
        } catch (error) {
          set({ errorInstallingMCPServer: error as string });
        }
      } else {
        const response = await installMcpServer({
          body: { mcp_connector_id: id },
        });

        if ('error' in response) {
          throw new Error(response.error as string);
        }

        // Refresh the MCP servers list
        await useMCPServersStore.getState().loadInstalledMCPServers();
      }
    } catch (error) {
      set({ errorInstallingMCPServer: error as string });
    } finally {
      set({ installingMCPServerName: null });
    }
  },

  uninstallMCPServer: async (mcpServerName: string) => {
    try {
      set({
        uninstallingMCPServerName: mcpServerName,
        errorUninstallingMCPServer: null,
      });

      const response = await uninstallMcpServer({
        path: { mcp_server_name: mcpServerName },
      });

      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Remove from MCP servers store
      useMCPServersStore.getState().removeMCPServerFromInstalledMCPServers(mcpServerName);
    } catch (error) {
      set({ errorUninstallingMCPServer: error as string });
    } finally {
      set({ uninstallingMCPServerName: null });
    }
  },

  connectToArchestraMCPServer: async () => {
    const MAX_RETRIES = 30;
    const RETRY_DELAY_MILLISECONDS = 1000;
    let retries = 0;

    const attemptConnection = async (): Promise<boolean> => {
      return true;
    };

    // Keep trying to connect until successful or max retries reached
    while (retries < MAX_RETRIES) {
      const connected = await attemptConnection();
      if (connected) {
        return;
      }

      retries++;
      if (retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MILLISECONDS));
      }
    }

    // If we've exhausted all retries, set error state
    set({
      archestraMCPServer: {
        name: ARCHESTRA_MCP_SERVER_NAME,
        id: 0,
        created_at: new Date().toISOString(),
        server_config: {
          transport: 'http',
          command: '',
          args: [],
          env: {},
        },
        url: config.archestra.mcpUrl,
        client: null,
        tools: [],
        status: MCPServerStatus.Error,
        error: 'Failed to connect after maximum retries',
      },
    });
  },

  connectToMCPServer: async (serverName: string, url: string) => {
    if (!url) {
      set((state) => ({
        installedMCPServers: state.installedMCPServers.map((server) =>
          server.name === serverName
            ? {
                ...server,
                client: null,
                status: MCPServerStatus.Error,
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
      const tools = await initializeConnectedMCPServerTools(client, serverName);

      set(({ installedMCPServers }) => ({
        installedMCPServers: installedMCPServers.map((server) =>
          server.name === serverName
            ? {
                ...server,
                client,
                tools,
                status: MCPServerStatus.Connected,
              }
            : server
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
                status: MCPServerStatus.Error,
                error: errorMessage,
              }
            : server
        ),
      }));
      return null;
    }
  },

  executeTool: async (serverName: string, toolCallRequest: CallToolRequest['params']) => {
    const { archestraMCPServer, installedMCPServers } = get();

    let client: Client | null = null;
    if (serverName === ARCHESTRA_MCP_SERVER_NAME && archestraMCPServer) {
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
      throw error;
    }
  },

  getAllAvailableTools: () => {
    const { installedMCPServers } = get();
    return installedMCPServers.flatMap((server) => server.tools);
  },

  getFilteredTools: () => {
    const { toolSearchQuery, getAllAvailableTools } = get();
    const allAvailableTools = getAllAvailableTools();

    if (!toolSearchQuery.trim()) {
      return allAvailableTools;
    }

    const query = toolSearchQuery.toLowerCase();
    const filtered = allAvailableTools.filter(({ serverName, name, description }) => {
      const serverMatches = serverName.toLowerCase().includes(query);
      const toolNameMatches = name.toLowerCase().includes(query);
      const formattedNameMatches = formatToolName(name).toLowerCase().includes(query);
      const descriptionMatches = description?.toLowerCase().includes(query) || false;
      return serverMatches || toolNameMatches || formattedNameMatches || descriptionMatches;
    });

    return filtered;
  },

  getAllAvailableToolsGroupedByServer: () => getToolsGroupedByServer(get().getAllAvailableTools()),
  getFilteredToolsGroupedByServer: () => getToolsGroupedByServer(get().getFilteredTools()),

  addSelectedTool: (tool: ToolWithMCPServerName) => {
    set(({ selectedTools }) => {
      // if tool is not already in selectedTools, add it
      if (!selectedTools.some((t) => t.name === tool.name)) {
        return {
          selectedTools: [...selectedTools, tool],
        };
      }
      return { selectedTools };
    });
  },

  removeSelectedTool: (tool: ToolWithMCPServerName) => {
    set(({ selectedTools }) => ({
      selectedTools: selectedTools.filter((t) => t.name !== tool.name),
    }));
  },

  setToolSearchQuery: (query: string) => {
    set({ toolSearchQuery: query });
  },
}));

// Initialize connections on store creation
useMCPServersStore.getState().connectToArchestraMCPServer();
useMCPServersStore.getState().loadInstalledMCPServers();
useMCPServersStore.getState().loadConnectorCatalog();

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = useMCPServersStore.getState();
    store.archestraMCPServer?.client?.close();
    store.installedMCPServers.forEach((server) => server.client?.close());
  });
}
