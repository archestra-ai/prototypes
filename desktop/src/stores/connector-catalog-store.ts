import { create } from 'zustand';

import {
  type McpConnectorCatalogEntry,
  getMcpConnectorCatalog,
  installMcpServerFromCatalog,
  startMcpServerOauth,
  uninstallMcpServer,
} from '@/lib/api';
import { websocketService } from '@/lib/websocket';

import { useMCPServersStore } from './mcp-servers-store';

interface ConnectorCatalogState {
  connectorCatalog: McpConnectorCatalogEntry[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;
  installingMCPServerName: string | null;
  errorInstallingMCPServer: { error: string; mcpServerCatalogId: string } | null;
  uninstallingMCPServerName: string | null;
  errorUninstallingMCPServer: string | null;
}

interface ConnectorCatalogActions {
  installMCPServerFromConnectorCatalog: (mcpServer: McpConnectorCatalogEntry) => Promise<void>;
  installOAuthMCPServerFromConnectorCatalog: (mcpServer: McpConnectorCatalogEntry) => Promise<void>;
  uninstallMCPServer: (mcpServerName: string) => Promise<void>;
  loadConnectorCatalog: () => Promise<void>;
  initialize: () => void;
}

type ConnectorCatalogStore = ConnectorCatalogState & ConnectorCatalogActions;

export const useConnectorCatalogStore = create<ConnectorCatalogStore>((set) => ({
  // State
  connectorCatalog: [],
  loadingConnectorCatalog: false,
  errorFetchingConnectorCatalog: null,
  installingMCPServerName: null,
  errorInstallingMCPServer: null,
  uninstallingMCPServerName: null,
  errorUninstallingMCPServer: null,

  // Actions
  loadConnectorCatalog: async () => {
    try {
      set({
        loadingConnectorCatalog: true,
        errorFetchingConnectorCatalog: null,
      });

      const response = await getMcpConnectorCatalog();

      if ('data' in response && response.data) {
        set({
          connectorCatalog: response.data.map((entry) => ({
            ...entry,
            tools: [],
          })),
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

  installMCPServerFromConnectorCatalog: async (mcpServer: McpConnectorCatalogEntry) => {
    const { id } = mcpServer;

    try {
      set({
        installingMCPServerName: mcpServer.title,
        errorInstallingMCPServer: null,
      });

      const response = await installMcpServerFromCatalog({
        body: { mcp_server_catalog_id: id },
      });

      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Refresh the MCP servers list
      await useMCPServersStore.getState().loadInstalledMCPServers();
    } catch (error) {
      set({ errorInstallingMCPServer: { error: String(error), mcpServerCatalogId: id } });
    } finally {
      set({ installingMCPServerName: null });
    }
  },

  installOAuthMCPServerFromConnectorCatalog: async (mcpServer: McpConnectorCatalogEntry) => {
    const { id, oauth } = mcpServer;

    try {
      set({
        installingMCPServerName: mcpServer.title,
        errorInstallingMCPServer: null,
      });

      if (!oauth) {
        throw new Error('OAuth configuration not needed for this MCP server');
      }

      // Start the OAuth flow
      const oauthResponse = await startMcpServerOauth({
        query: { mcp_server_catalog_id: id, provider: oauth.provider },
      });

      if ('error' in oauthResponse) {
        throw new Error(oauthResponse.error as string);
      }

      // OAuth flow started successfully - the WebSocket events will handle the rest
    } catch (error) {
      set({ errorInstallingMCPServer: { error: String(error), mcpServerCatalogId: id } });
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

  initialize: () => {
    const state = useConnectorCatalogStore.getState();

    // Load the connector catalog
    state.loadConnectorCatalog();

    // Connect to WebSocket
    websocketService.connect().catch((error) => {
      console.error('Failed to connect to WebSocket:', error);
    });

    // Subscribe to OAuth success events
    websocketService.subscribe('oauth-success', ({ payload: { mcp_server_catalog_id } }) => {
      console.log('OAuth success for MCP server:', mcp_server_catalog_id);

      // Reload installed MCP servers to reflect the newly authenticated server
      useMCPServersStore.getState().loadInstalledMCPServers();

      // Clear any installation error that might have been set
      set({
        errorInstallingMCPServer: null,
        installingMCPServerName: null,
      });
    });

    // Subscribe to OAuth error events
    websocketService.subscribe('oauth-error', ({ payload: { mcp_server_catalog_id, error } }) => {
      console.error('OAuth error for MCP server:', mcp_server_catalog_id, error);

      // Set the error in the store
      set({
        errorInstallingMCPServer: {
          error: `OAuth authentication failed: ${error}`,
          mcpServerCatalogId: mcp_server_catalog_id,
        },
        installingMCPServerName: null,
      });
    });
  },
}));

// Initialize the store
useConnectorCatalogStore.getState().initialize();
