import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequest, ClientCapabilities, Tool } from '@modelcontextprotocol/sdk/types.js';
import { create } from 'zustand';

import {
  type McpServer,
  getMcpServers,
  installMcpServer,
  startMcpServerOauth,
  uninstallMcpServer,
} from '@clients/archestra/api/gen';
import { type ArchestraMcpServerManifest, getSearch as searchCatalog } from '@clients/archestra/catalog/gen';
import config from '@ui/config';
import { getToolsGroupedByServer } from '@ui/lib/utils/mcp-server';
import { formatToolName } from '@ui/lib/utils/tools';
import { websocketService } from '@ui/lib/websocket';
import {
  ConnectedMcpServer,
  McpServerStatus,
  McpServerToolsMap,
  McpServerUserConfigValues,
  ToolWithMcpServerInfo,
} from '@ui/types';

const CATALOG_PAGE_SIZE = 20;

/**
 * NOTE: these are here because the "archestra" MCP server is "injected" into the list of "installed" MCP servers
 * (since it is not actually persisted in the database)
 */
const ARCHESTRA_MCP_SERVER_ID = 'archestra';
const ARCHESTRA_MCP_SERVER_NAME = 'Archestra.ai';

/**
 * TODO: This is temporary test data. Remove once catalog API returns user_config
 *
 * Right now user_config is in the returned objects, but we haven't yet actually populated
 * any data into user_config in our catalog objects
 */
const TEST_USER_CONFIG: ArchestraMcpServerManifest['user_config'] = {
  allowed_directories: {
    type: 'directory',
    title: 'Allowed Directories',
    description: 'Directories the server can access',
    multiple: true,
    required: true,
    default: ['${HOME}/Desktop'],
  },
  api_key: {
    type: 'string',
    title: 'API Key',
    description: 'Your API key for authentication',
    sensitive: true,
    required: false,
  },
  max_file_size: {
    type: 'number',
    title: 'Maximum File Size (MB)',
    description: 'Maximum file size to process',
    default: 10,
    min: 1,
    max: 100,
  },
};

/**
 * TODO: these shouldn't be hardcoded here, instead we should expose an endpoint on the catalog server that
 * returns all options
 *
 * Right now we DO have all of the available values, but this is via a typescript type in the codegen'd types
 * NOT an actual javascript variable that we can use here
 *
 * (somewhere around here https://github.com/archestra-ai/website/blob/5dc8864287bd147c6d3548ae447d4404936e595b/app/app/mcp-catalog/api/search)
 */
const TEMPORARY_CONNECTOR_CATALOG_CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'Aggregators', label: 'Aggregators' },
  { value: 'AI Tools', label: 'AI Tools' },
  { value: 'Art & Culture', label: 'Art & Culture' },
  { value: 'Audio', label: 'Audio' },
  { value: 'Browser Automation', label: 'Browser Automation' },
  { value: 'CLI Tools', label: 'CLI Tools' },
  { value: 'Cloud', label: 'Cloud' },
  { value: 'Communication', label: 'Communication' },
  { value: 'Data', label: 'Data' },
  { value: 'Data Science', label: 'Data Science' },
  { value: 'Development', label: 'Development' },
  { value: 'File Management', label: 'File Management' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Gaming', label: 'Gaming' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'IoT', label: 'IoT' },
  { value: 'Knowledge', label: 'Knowledge' },
  { value: 'Location', label: 'Location' },
  { value: 'Logistics', label: 'Logistics' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Media', label: 'Media' },
  { value: 'Monitoring', label: 'Monitoring' },
  { value: 'Productivity', label: 'Productivity' },
  { value: 'Search', label: 'Search' },
  { value: 'Security', label: 'Security' },
  { value: 'Social Media', label: 'Social Media' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Support', label: 'Support' },
  { value: 'Translation', label: 'Translation' },
  { value: 'Travel', label: 'Travel' },
  { value: 'Utilities', label: 'Utilities' },
];

interface McpServersState {
  archestraMcpServer: ConnectedMcpServer;

  installedMcpServers: ConnectedMcpServer[];
  loadingInstalledMcpServers: boolean;
  errorLoadingInstalledMcpServers: string | null;

  connectorCatalog: ArchestraMcpServerManifest[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;

  connectorCatalogCategories: { value: string; label: string }[];
  loadingConnectorCatalogCategories: boolean;
  errorFetchingConnectorCatalogCategories: string | null;

  catalogSearchQuery: string;
  catalogSelectedCategory: string;
  catalogHasMore: boolean;
  catalogTotalCount: number;
  catalogOffset: number;

  installingMcpServerId: string | null;
  errorInstallingMcpServer: string | null;

  uninstallingMcpServerId: string | null;
  errorUninstallingMcpServer: string | null;

  selectedTools: ToolWithMcpServerInfo[];
  toolSearchQuery: string;
}

interface McpServersActions {
  loadInstalledMcpServers: () => Promise<void>;
  addMcpServerToInstalledMcpServers: (mcpServer: McpServer) => void;
  removeMcpServerFromInstalledMcpServers: (mcpServerId: string) => void;

  loadConnectorCatalog: (append?: boolean) => Promise<void>;
  loadMoreCatalogServers: () => Promise<void>;
  setCatalogSearchQuery: (query: string) => void;
  setCatalogSelectedCategory: (category: string) => void;
  resetCatalogSearch: () => void;
  installMcpServerFromConnectorCatalog: (
    mcpServer: ArchestraMcpServerManifest,
    userConfigValues?: McpServerUserConfigValues
  ) => Promise<void>;
  uninstallMcpServer: (mcpServerId: string) => Promise<void>;

  connectToArchestraMcpServer: () => Promise<void>;
  connectToMcpServer: (mcpServer: ConnectedMcpServer, url: string) => Promise<Client | null>;

  executeTool: (mcpServerId: string, request: CallToolRequest['params']) => Promise<any>;
  getAllAvailableTools: () => ToolWithMcpServerInfo[];
  getFilteredTools: () => ToolWithMcpServerInfo[];
  getAllAvailableToolsGroupedByServer: () => McpServerToolsMap;
  getFilteredToolsGroupedByServer: () => McpServerToolsMap;

  addSelectedTool: (tool: ToolWithMcpServerInfo) => void;
  removeSelectedTool: (tool: ToolWithMcpServerInfo) => void;

  setToolSearchQuery: (query: string) => void;
}

type McpServersStore = McpServersState & McpServersActions;

export function constructProxiedMcpServerUrl(mcpServerName: string) {
  return `${config.archestra.mcpProxyUrl}/${mcpServerName}`;
}

const configureMcpClient = async (
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

const initializeConnectedMcpServerTools = async (
  client: Client,
  server: ConnectedMcpServer
): Promise<ToolWithMcpServerInfo[]> => {
  const { tools } = await client.listTools();
  return tools.map((tool: Tool) => ({
    ...tool,
    server: {
      id: server.id,
      name: server.name,
    },
    enabled: true,
  }));
};

export const useMcpServersStore = create<McpServersStore>((set, get) => ({
  // State
  archestraMcpServer: {
    id: ARCHESTRA_MCP_SERVER_ID,
    name: ARCHESTRA_MCP_SERVER_NAME,
    createdAt: new Date().toISOString(),
    serverConfig: {
      command: '',
      args: [],
      env: {},
    },
    url: config.archestra.mcpUrl,
    client: null,
    tools: [],
    status: McpServerStatus.Connecting,
    error: null,
    userConfigValues: {},
  },

  installedMcpServers: [],
  loadingInstalledMcpServers: false,
  errorLoadingInstalledMcpServers: null,

  connectorCatalog: [],
  loadingConnectorCatalog: false,
  errorFetchingConnectorCatalog: null,
  catalogSearchQuery: '',
  catalogSelectedCategory: 'all',
  catalogHasMore: true,
  catalogTotalCount: 0,
  catalogOffset: 0,

  connectorCatalogCategories: TEMPORARY_CONNECTOR_CATALOG_CATEGORIES,
  loadingConnectorCatalogCategories: false,
  errorFetchingConnectorCatalogCategories: null,

  installingMcpServerId: null,
  errorInstallingMcpServer: null,

  uninstallingMcpServerId: null,
  errorUninstallingMcpServer: null,

  selectedTools: [],
  toolSearchQuery: '',

  // Actions
  loadInstalledMcpServers: async () => {
    set({
      loadingInstalledMcpServers: true,
      errorLoadingInstalledMcpServers: null,
    });

    try {
      const { data } = await getMcpServers();
      if (data) {
        for (const server of data) {
          get().addMcpServerToInstalledMcpServers(server);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ errorLoadingInstalledMcpServers: errorMessage });
    } finally {
      set({ loadingInstalledMcpServers: false });
    }
  },

  addMcpServerToInstalledMcpServers: (mcpServer: McpServer) => {
    set((state) => ({
      installedMcpServers: [
        ...state.installedMcpServers,
        {
          ...mcpServer,
          tools: [],
          url: constructProxiedMcpServerUrl(mcpServer.name),
          status: McpServerStatus.Connecting,
          error: null,
          client: null,
        },
      ],
    }));

    // Connect to the newly added server
    const newServer = get().installedMcpServers.find((s) => s.name === mcpServer.name);
    if (newServer) {
      get().connectToMcpServer(newServer, newServer.url);
    }
  },

  removeMcpServerFromInstalledMcpServers: (mcpServerId: string) => {
    // Close the client connection before removing
    const server = get().installedMcpServers.find((s) => s.id === mcpServerId);
    if (server?.client) {
      server.client.close();
    }

    set((state) => ({
      installedMcpServers: state.installedMcpServers.filter((mcpServer) => mcpServer.id !== mcpServerId),
    }));
  },

  loadConnectorCatalog: async (append = false) => {
    const { catalogSearchQuery, catalogSelectedCategory, catalogOffset } = get();

    try {
      set({
        loadingConnectorCatalog: true,
        errorFetchingConnectorCatalog: null,
      });

      const params: any = {
        limit: CATALOG_PAGE_SIZE,
        offset: append ? catalogOffset : 0,
      };

      if (catalogSearchQuery) {
        params.q = catalogSearchQuery;
      }

      if (catalogSelectedCategory && catalogSelectedCategory !== 'all') {
        params.category = catalogSelectedCategory;
      }

      const { data } = await searchCatalog({ query: params });

      if (data) {
        /**
         * NOTE: see the note above about TEST_USER_CONFIG
         * remove this once we have real "user config" data
         */
        const serversWithUserConfig = (data.servers || []).map((server) => ({
          ...server,
          user_config: TEST_USER_CONFIG,
        }));

        set({
          connectorCatalog: append ? [...get().connectorCatalog, ...serversWithUserConfig] : serversWithUserConfig,
          catalogHasMore: data.hasMore || false,
          catalogTotalCount: data.totalCount || 0,
          catalogOffset: append ? get().catalogOffset + CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE,
        });
      }
    } catch (error) {
      set({ errorFetchingConnectorCatalog: error as string });
    } finally {
      set({ loadingConnectorCatalog: false });
    }
  },

  loadMoreCatalogServers: async () => {
    const { catalogHasMore, loadingConnectorCatalog } = get();
    if (!catalogHasMore || loadingConnectorCatalog) return;

    await get().loadConnectorCatalog(true);
  },

  setCatalogSearchQuery: (query: string) => {
    set({
      catalogSearchQuery: query,
      catalogOffset: 0,
    });
    get().loadConnectorCatalog();
  },

  setCatalogSelectedCategory: (category: string) => {
    set({
      catalogSelectedCategory: category,
      catalogOffset: 0,
    });
    get().loadConnectorCatalog();
  },

  resetCatalogSearch: () => {
    set({
      catalogSearchQuery: '',
      catalogSelectedCategory: 'all',
      catalogOffset: 0,
      catalogHasMore: true,
    });
    get().loadConnectorCatalog();
  },

  installMcpServerFromConnectorCatalog: async (
    { config_for_archestra, name }: ArchestraMcpServerManifest,
    userConfigValues?: McpServerUserConfigValues
  ) => {
    try {
      set({
        /**
         * NOTE: the "name" field is the unique identifier for an MCP server in the catalog
         * When an mcp server from the catalog is installed (ie. persisted in the database),
         * the "name" field is what is set as the "id" field
         */
        installingMcpServerId: name,
        errorInstallingMcpServer: null,
      });

      // Check if OAuth is required
      if (config_for_archestra.oauth.required) {
        try {
          // Start OAuth flow
          const { data } = await startMcpServerOauth({
            body: { catalogName: name },
          });

          if (data) {
            // For OAuth connectors, the backend will handle the installation after successful auth
            alert(`OAuth setup started for ${name}. Please complete the authentication in your browser.`);
          }
        } catch (error) {
          set({ errorInstallingMcpServer: error as string });
        }
      } else {
        const { data } = await installMcpServer({
          body: { catalogName: name, userConfigValues },
        });

        // Refresh the MCP servers list
        await useMcpServersStore.getState().loadInstalledMcpServers();
      }
    } catch (error) {
      set({ errorInstallingMcpServer: error as string });
    } finally {
      set({ installingMcpServerId: null });
    }
  },

  uninstallMcpServer: async (mcpServerId: string) => {
    try {
      set({
        uninstallingMcpServerId: mcpServerId,
        errorUninstallingMcpServer: null,
      });

      await uninstallMcpServer({
        path: { id: mcpServerId },
      });

      // Remove from MCP servers store
      useMcpServersStore.getState().removeMcpServerFromInstalledMcpServers(mcpServerId);
    } catch (error) {
      set({ errorUninstallingMcpServer: error as string });
    } finally {
      set({ uninstallingMcpServerId: null });
    }
  },

  connectToArchestraMcpServer: async () => {
    const MAX_RETRIES = 30;
    const RETRY_DELAY_MILLISECONDS = 1000;

    let retries = 0;

    const attemptConnection = async (): Promise<boolean> => {
      const { archestraMcpServer } = get();

      try {
        const client = await configureMcpClient(`${ARCHESTRA_MCP_SERVER_NAME}-client`, archestraMcpServer.url, {
          tools: {},
        });

        if (client) {
          const tools = await initializeConnectedMcpServerTools(client, archestraMcpServer);

          set({
            archestraMcpServer: {
              ...archestraMcpServer,
              client,
              tools,
              status: McpServerStatus.Connected,
              error: null,
            },
          });

          return true;
        }
        return false;
      } catch (error) {
        return false;
      }
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
      archestraMcpServer: {
        ...get().archestraMcpServer,
        status: McpServerStatus.Error,
        error: 'Failed to connect after maximum retries',
      },
    });
  },

  connectToMcpServer: async (mcpServer: ConnectedMcpServer, url: string) => {
    const { id } = mcpServer;

    if (!url) {
      set((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.id === id
            ? {
                ...server,
                client: null,
                status: McpServerStatus.Error,
                error: 'No URL configured',
              }
            : server
        ),
      }));
      return null;
    }

    try {
      const client = await configureMcpClient(`${id}-client`, url, {
        tools: {},
      });

      if (!client) {
        return null;
      }

      // List available tools
      const tools = await initializeConnectedMcpServerTools(client, mcpServer);

      set(({ installedMcpServers }) => ({
        installedMcpServers: installedMcpServers.map((server) =>
          server.id === id
            ? {
                ...server,
                client,
                tools,
                status: McpServerStatus.Connected,
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
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.id === id
            ? {
                ...server,
                client: null,
                status: McpServerStatus.Error,
                error: errorMessage,
              }
            : server
        ),
      }));
      return null;
    }
  },

  executeTool: async (mcpServerId: string, toolCallRequest: CallToolRequest['params']) => {
    const { archestraMcpServer, installedMcpServers } = get();

    let client: Client | null = null;
    if (mcpServerId === ARCHESTRA_MCP_SERVER_ID && archestraMcpServer) {
      client = archestraMcpServer.client;
    } else {
      const server = installedMcpServers.find((s) => s.id === mcpServerId);
      client = server?.client || null;
    }

    if (!client) {
      throw new Error(`No connection to server ${mcpServerId}`);
    }

    try {
      const result = await client.callTool(toolCallRequest);
      return result;
    } catch (error) {
      throw error;
    }
  },

  getAllAvailableTools: () => {
    const { installedMcpServers } = get();
    return installedMcpServers.flatMap((server) => server.tools);
  },

  getFilteredTools: () => {
    const { toolSearchQuery, getAllAvailableTools } = get();
    const allAvailableTools = getAllAvailableTools();

    if (!toolSearchQuery.trim()) {
      return allAvailableTools;
    }

    const query = toolSearchQuery.toLowerCase();
    const filtered = allAvailableTools.filter(({ server, name, description }) => {
      const serverMatches = server.name.toLowerCase().includes(query);
      const toolNameMatches = name.toLowerCase().includes(query);
      const formattedNameMatches = formatToolName(name).toLowerCase().includes(query);
      const descriptionMatches = description?.toLowerCase().includes(query) || false;
      return serverMatches || toolNameMatches || formattedNameMatches || descriptionMatches;
    });

    return filtered;
  },

  getAllAvailableToolsGroupedByServer: () => getToolsGroupedByServer(get().getAllAvailableTools()),
  getFilteredToolsGroupedByServer: () => getToolsGroupedByServer(get().getFilteredTools()),

  addSelectedTool: (tool: ToolWithMcpServerInfo) => {
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

  removeSelectedTool: (tool: ToolWithMcpServerInfo) => {
    set(({ selectedTools }) => ({
      selectedTools: selectedTools.filter((t) => t.name !== tool.name),
    }));
  },

  setToolSearchQuery: (query: string) => {
    set({ toolSearchQuery: query });
  },
}));

// WebSocket event subscriptions for MCP server events
let mcpUnsubscribers: Array<() => void> = [];

const subscribeToMcpWebSocketEvents = () => {
  // Cleanup any existing subscriptions
  mcpUnsubscribers.forEach((unsubscribe) => unsubscribe());
  mcpUnsubscribers = [];

  // MCP server starting
  mcpUnsubscribers.push(
    websocketService.subscribe('sandbox-mcp-server-starting', (message) => {
      const { serverId } = message.payload;

      useMcpServersStore.setState((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.id === serverId
            ? {
                ...server,
                status: McpServerStatus.Connecting,
                error: null,
              }
            : server
        ),
      }));
    })
  );

  // MCP server started successfully
  mcpUnsubscribers.push(
    websocketService.subscribe('sandbox-mcp-server-started', (message) => {
      const { serverId } = message.payload;

      // Server started in sandbox, now connect to it
      const server = useMcpServersStore.getState().installedMcpServers.find((s) => s.id === serverId);
      if (server) {
        useMcpServersStore.getState().connectToMcpServer(server, server.url);
      }
    })
  );

  // MCP server failed to start
  mcpUnsubscribers.push(
    websocketService.subscribe('sandbox-mcp-server-failed', (message) => {
      const { serverId, error } = message.payload;

      useMcpServersStore.setState((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.id === serverId
            ? {
                ...server,
                status: McpServerStatus.Error,
                error: error,
              }
            : server
        ),
      }));
    })
  );
};

// Initialize WebSocket subscriptions when the store is created
subscribeToMcpWebSocketEvents();

// Initialize connections on store creation
useMcpServersStore.getState().connectToArchestraMcpServer();
useMcpServersStore.getState().loadInstalledMcpServers();
useMcpServersStore.getState().loadConnectorCatalog();

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = useMcpServersStore.getState();
    store.archestraMcpServer?.client?.close();
    store.installedMcpServers.forEach((server) => server.client?.close());

    // Cleanup WebSocket subscriptions
    mcpUnsubscribers.forEach((unsubscribe) => unsubscribe());
  });
}
