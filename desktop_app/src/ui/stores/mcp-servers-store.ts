import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ClientCapabilities, Tool } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

import config from '@ui/config';
import {
  type InstallMcpServerData,
  type McpServer,
  getMcpServers,
  installMcpServer,
  startMcpServerOauth,
  uninstallMcpServer,
} from '@ui/lib/clients/archestra/api/gen';
import { ConnectedMcpServer, ToolWithMcpServerInfo } from '@ui/types';

import { useSandboxStore } from './sandbox-store';

/**
 * NOTE: these are here because the "archestra" MCP server is "injected" into the list of "installed" MCP servers
 * (since it is not actually persisted in the database)
 */
export const ARCHESTRA_MCP_SERVER_ID = 'archestra';
const ARCHESTRA_MCP_SERVER_NAME = 'Archestra.ai';

interface McpServersState {
  archestraMcpServer: ConnectedMcpServer;

  installedMcpServers: ConnectedMcpServer[];
  loadingInstalledMcpServers: boolean;
  errorLoadingInstalledMcpServers: string | null;

  installingMcpServerId: string | null;
  errorInstallingMcpServer: string | null;

  uninstallingMcpServerId: string | null;
  errorUninstallingMcpServer: string | null;
}

interface McpServersActions {
  loadInstalledMcpServers: () => Promise<void>;
  addMcpServerToInstalledMcpServers: (mcpServer: McpServer) => void;
  removeMcpServerFromInstalledMcpServers: (mcpServerId: string) => void;

  updateMcpServer: (mcpServerId: string, data: Partial<ConnectedMcpServer>) => void;
  installMcpServer: (requiresOAuth: boolean, installData: InstallMcpServerData['body']) => Promise<void>;
  uninstallMcpServer: (mcpServerId: string) => Promise<void>;

  connectToArchestraMcpServer: () => Promise<void>;
  connectToMcpServer: (mcpServer: ConnectedMcpServer, url: string) => Promise<Client | null>;

  _init: () => void;
}

type McpServersStore = McpServersState & McpServersActions;

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
      name: server.name || 'Unnamed Server',
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
    userConfigValues: {},
    url: config.archestra.mcpUrl,
    client: null,
    tools: [],
    hasFetchedTools: false,
    state: 'initializing',
    startupPercentage: 0,
    message: null,
    error: null,
  },

  installedMcpServers: [],
  loadingInstalledMcpServers: false,
  errorLoadingInstalledMcpServers: null,

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
    set((state) => {
      const newServer: ConnectedMcpServer = {
        ...mcpServer,
        tools: [],
        hasFetchedTools: false,
        url: `${config.archestra.mcpProxyUrl}/${mcpServer.id}`,
        client: null,
        state: 'initializing',
        startupPercentage: 0,
        message: null,
        error: null,
      };

      get().connectToMcpServer(newServer, newServer.url);

      return {
        installedMcpServers: [...state.installedMcpServers, newServer],
      };
    });
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

  updateMcpServer: (mcpServerId: string, data: Partial<ConnectedMcpServer>) => {
    set((state) => {
      const server = state.installedMcpServers.find((s) => s.id === mcpServerId);
      if (server) {
        return {
          installedMcpServers: state.installedMcpServers.map((s) => (s.id === mcpServerId ? { ...s, ...data } : s)),
        };
      }
      return state;
    });
  },

  installMcpServer: async (requiresOAuth: boolean, installData: InstallMcpServerData['body']) => {
    const { id } = installData;
    try {
      set({
        /**
         * If it is a custom MCP server installation, let's generate a temporary UUID for it
         * (just for UI purposes of tracking state of "MCP server currently being installed")
         */
        installingMcpServerId: id || uuidv4(),
        errorInstallingMcpServer: null,
      });

      /**
       * If OAuth is required for installation of this MCP server, we start the OAuth flow
       * rather than directly "installing" the MCP server
       */
      if (requiresOAuth) {
        // Start OAuth flow
        const { data } = await startMcpServerOauth({
          body: { catalogName: id || '' },
        });

        if (data) {
          // For OAuth connectors, the backend will handle the installation after successful auth
          alert(`OAuth setup started for ${name}. Please complete the authentication in your browser.`);
        }
      } else {
        const { data: newlyInstalledMcpServer, error } = await installMcpServer({ body: installData });

        if (error) {
          set({ errorInstallingMcpServer: error.error || 'Unknown error installing MCP server' });
          return;
        }

        get().addMcpServerToInstalledMcpServers(newlyInstalledMcpServer);
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
              hasFetchedTools: true,
              state: 'running',
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
        state: 'error',
        error: 'Failed to connect after maximum retries',
      },
    });
  },

  connectToMcpServer: async (mcpServer: ConnectedMcpServer, url: string) => {
    const { id } = mcpServer;

    // For containerized MCP servers, wait for sandbox to be ready!
    const MAX_SANDBOX_WAIT_RETRIES = 60; // 60 seconds total
    const SANDBOX_RETRY_DELAY_MS = 1000;
    let sandboxRetries = 0;

    const waitForSandbox = async (): Promise<boolean> => {
      while (sandboxRetries < MAX_SANDBOX_WAIT_RETRIES) {
        const { statusSummary } = useSandboxStore.getState();

        if (statusSummary.status === 'running') {
          return true; // Sandbox is ready!
        }

        sandboxRetries++;
        if (sandboxRetries < MAX_SANDBOX_WAIT_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, SANDBOX_RETRY_DELAY_MS));
        }
      }
      return false; // Timeout
    };

    const sandboxReady = await waitForSandbox();

    if (!sandboxReady) {
      get().updateMcpServer(id, {
        client: null,
        state: 'error',
        error: 'Sandbox initialization timeout - Podman runtime not ready',
      });
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

      get().updateMcpServer(id, {
        client,
        tools,
        hasFetchedTools: true,
        state: 'running',
      });
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

      get().updateMcpServer(id, {
        client: null,
        state: 'error',
        error: errorMessage,
      });
      return null;
    }
  },

  _init: () => {
    const { connectToArchestraMcpServer, loadInstalledMcpServers } = get();

    connectToArchestraMcpServer();
    loadInstalledMcpServers();
  },
}));

// Initialize data + connections on store creation
useMcpServersStore.getState()._init();

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = useMcpServersStore.getState();
    store.archestraMcpServer?.client?.close();
    store.installedMcpServers.forEach((server) => server.client?.close());
  });
}
