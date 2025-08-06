import { Client } from '@modelcontextprotocol/sdk/client/index';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { CallToolRequest, ClientCapabilities } from '@modelcontextprotocol/sdk/types';
import { create } from 'zustand';

import type { McpServer } from '@archestra/types';
import { getMcpServers, installMcpServer, startMcpServerOauth, uninstallMcpServer } from '@clients/archestra/api/gen';
import { type McpServer as McpServerCatalogEntry, getSearch as searchCatalog } from '@clients/archestra/catalog/gen';
import config from '@ui/config';
import { getToolsGroupedByServer } from '@ui/lib/utils/mcp-server';
import { formatToolName } from '@ui/lib/utils/tools';
import { websocketService } from '@ui/lib/websocket';
import { ConnectedMcpServer, McpServerStatus, McpServerToolsMap, ToolWithMcpServerInfo } from '@ui/types';

const ARCHESTRA_MCP_SERVER_NAME = 'archestra';

interface McpServersState {
  archestraMcpServer: ConnectedMcpServer | null;

  installedMcpServers: ConnectedMcpServer[];
  loadingInstalledMcpServers: boolean;
  errorLoadingInstalledMcpServers: string | null;

  connectorCatalog: McpServerCatalogEntry[];
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

  installingMcpServerSlug: string | null;
  errorInstallingMcpServer: string | null;

  uninstallingMcpServerSlug: string | null;
  errorUninstallingMcpServer: string | null;

  selectedTools: ToolWithMcpServerInfo[];
  toolSearchQuery: string;
}

interface McpServersActions {
  loadInstalledMcpServers: () => Promise<void>;
  addMcpServerToInstalledMcpServers: (mcpServer: McpServer) => void;
  removeMcpServerFromInstalledMcpServers: (slug: string) => void;

  loadConnectorCatalog: (append?: boolean) => Promise<void>;
  loadMoreCatalogServers: () => Promise<void>;
  setCatalogSearchQuery: (query: string) => void;
  setCatalogSelectedCategory: (category: string) => void;
  resetCatalogSearch: () => void;
  installMcpServerFromConnectorCatalog: (mcpServer: McpServerCatalogEntry) => Promise<void>;
  uninstallMcpServer: (slug: string) => Promise<void>;

  connectToArchestraMcpServer: () => Promise<void>;
  connectToMcpServer: (mcpServer: ConnectedMcpServer, url: string) => Promise<Client | null>;

  executeTool: (slug: string, request: CallToolRequest['params']) => Promise<any>;
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
  return tools.map((tool) => ({
    ...tool,
    server: {
      slug: server.slug,
      name: server.name,
    },
    enabled: true,
  }));
};

const CATALOG_PAGE_SIZE = 20;

export const useMcpServersStore = create<McpServersStore>((set, get) => ({
  // State
  archestraMcpServer: null,

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

  /**
   * TODO: these shouldn't be hardcoded here, instead we should expose an endpoint on the catalog server that
   * returns all options
   *
   * (somewhere around here https://github.com/archestra-ai/website/blob/5dc8864287bd147c6d3548ae447d4404936e595b/app/app/mcp-catalog/api/search)
   */
  connectorCatalogCategories: [
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
  ],
  loadingConnectorCatalogCategories: false,
  errorFetchingConnectorCatalogCategories: null,

  installingMcpServerSlug: null,
  errorInstallingMcpServer: null,

  uninstallingMcpServerSlug: null,
  errorUninstallingMcpServer: null,

  selectedTools: [],
  toolSearchQuery: '',

  // Actions
  loadInstalledMcpServers: async () => {
    try {
      set({
        loadingInstalledMcpServers: true,
        errorLoadingInstalledMcpServers: null,
      });

      const response = await getMcpServers();

      if ('data' in response && response.data) {
        // Add servers and connect to them
        for (const server of response.data) {
          get().addMcpServerToInstalledMcpServers(server);
        }
      } else if ('error' in response) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
        throw new Error(errorMessage);
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

  removeMcpServerFromInstalledMcpServers: (slug: string) => {
    // Close the client connection before removing
    const server = get().installedMcpServers.find((s) => s.slug === slug);
    if (server?.client) {
      server.client.close();
    }

    set((state) => ({
      installedMcpServers: state.installedMcpServers.filter((mcpServer) => mcpServer.slug !== slug),
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

      const response = await searchCatalog({
        query: params,
      });

      if ('data' in response && response.data) {
        const data = response.data;
        set({
          connectorCatalog: append ? [...get().connectorCatalog, ...(data.servers || [])] : data.servers || [],
          catalogHasMore: data.hasMore || false,
          catalogTotalCount: data.totalCount || 0,
          catalogOffset: append ? get().catalogOffset + CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE,
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

  installMcpServerFromConnectorCatalog: async ({ configForArchestra, name, slug }: McpServerCatalogEntry) => {
    try {
      set({
        installingMcpServerSlug: slug,
        errorInstallingMcpServer: null,
      });

      // Check if OAuth is required
      if (configForArchestra?.oauth?.required) {
        try {
          // Start OAuth flow
          const response = await startMcpServerOauth({
            body: { slug },
          });

          if ('data' in response && response.data) {
            // For OAuth connectors, the backend will handle the installation after successful auth
            alert(`OAuth setup started for ${name}. Please complete the authentication in your browser.`);
          } else if ('error' in response) {
            throw new Error(response.error as string);
          }
        } catch (error) {
          set({ errorInstallingMcpServer: error as string });
        }
      } else {
        const response = await installMcpServer({
          body: { slug },
        });

        if ('error' in response) {
          throw new Error(response.error as string);
        }

        // Refresh the MCP servers list
        await useMcpServersStore.getState().loadInstalledMcpServers();
      }
    } catch (error) {
      set({ errorInstallingMcpServer: error as string });
    } finally {
      set({ installingMcpServerSlug: null });
    }
  },

  uninstallMcpServer: async (slug: string) => {
    try {
      set({
        uninstallingMcpServerSlug: slug,
        errorUninstallingMcpServer: null,
      });

      const response = await uninstallMcpServer({
        path: { slug },
      });

      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Remove from MCP servers store
      useMcpServersStore.getState().removeMcpServerFromInstalledMcpServers(slug);
    } catch (error) {
      set({ errorUninstallingMcpServer: error as string });
    } finally {
      set({ uninstallingMcpServerSlug: null });
    }
  },

  connectToArchestraMcpServer: async () => {
    const MAX_RETRIES = 30;
    const RETRY_DELAY_MILLISECONDS = 1000;

    /**
     * id, slug, name, createdAt, and serverConfig aren't needed for the Archestra MCP server, they're simply added
     * here to appease typing 😛
     */
    const archestraMcpServer: ConnectedMcpServer = {
      id: 0,
      slug: ARCHESTRA_MCP_SERVER_NAME,
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
    };

    let retries = 0;

    // TODO: once we figure out the /mcp CORS issues, simply uncomment this out and things should just start working
    // const attemptConnection = async (): Promise<boolean> => {
    //   try {
    //     const client = await configureMcpClient(`${ARCHESTRA_MCP_SERVER_NAME}-client`, archestraMcpServer.url, {
    //       tools: {},
    //     });

    //     if (client) {
    //       const tools = await initializeConnectedMcpServerTools(client, archestraMcpServer);

    //       set({
    //         archestraMcpServer: {
    //           ...archestraMcpServer,
    //           client,
    //           tools,
    //           status: McpServerStatus.Connected,
    //           error: null,
    //         },
    //       });

    //       return true;
    //     }
    //     return false;
    //   } catch (error) {
    //     return false;
    //   }
    // };
    const attemptConnection = async () => true;

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
        ...archestraMcpServer,
        status: McpServerStatus.Error,
        error: 'Failed to connect after maximum retries',
      },
    });
  },

  connectToMcpServer: async (mcpServer: ConnectedMcpServer, url: string) => {
    const { name, slug } = mcpServer;

    if (!url) {
      set((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.slug === slug
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
      const client = await configureMcpClient(`${slug}-client`, url, {
        tools: {},
      });

      if (!client) {
        return null;
      }

      // List available tools
      const tools = await initializeConnectedMcpServerTools(client, mcpServer);

      set(({ installedMcpServers }) => ({
        installedMcpServers: installedMcpServers.map((server) =>
          server.slug === slug
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
          server.slug === slug
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

  executeTool: async (slug: string, toolCallRequest: CallToolRequest['params']) => {
    const { archestraMcpServer, installedMcpServers } = get();

    let client: Client | null = null;
    if (slug === ARCHESTRA_MCP_SERVER_NAME && archestraMcpServer) {
      client = archestraMcpServer.client;
    } else {
      const server = installedMcpServers.find((s) => s.slug === slug);
      client = server?.client || null;
    }

    if (!client) {
      throw new Error(`No connection to server ${slug}`);
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
      const { serverSlug } = message.payload;

      useMcpServersStore.setState((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.slug === serverSlug
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
      const { serverSlug } = message.payload;

      // Server started in sandbox, now connect to it
      const server = useMcpServersStore.getState().installedMcpServers.find((s) => s.slug === serverSlug);
      if (server) {
        useMcpServersStore.getState().connectToMcpServer(server, server.url);
      }
    })
  );

  // MCP server failed to start
  mcpUnsubscribers.push(
    websocketService.subscribe('sandbox-mcp-server-failed', (message) => {
      const { serverSlug, error } = message.payload;

      useMcpServersStore.setState((state) => ({
        installedMcpServers: state.installedMcpServers.map((server) =>
          server.slug === serverSlug
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
