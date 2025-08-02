import { create } from 'zustand';

import {
  type McpConnectorCatalogEntry,
  getMcpConnectorCatalog,
  installMcpServerFromCatalog,
  startMcpServerOauth,
  uninstallMcpServer,
} from '@/lib/api-client';

import { useMCPServersStore } from './mcp-servers-store';

// Use the generated types but maintain backwards compatibility
type ConnectorCatalogEntry = McpConnectorCatalogEntry;

interface ConnectorCatalogState {
  connectorCatalog: ConnectorCatalogEntry[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;
  installingMCPServerName: string | null;
  errorInstallingMCPServer: string | null;
  uninstallingMCPServerName: string | null;
  errorUninstallingMCPServer: string | null;
}

interface ConnectorCatalogActions {
  installMCPServerFromConnectorCatalog: (mcpServer: ConnectorCatalogEntry) => Promise<void>;
  uninstallMCPServer: (mcpServerName: string) => Promise<void>;
  loadConnectorCatalog: () => Promise<void>;
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

  installMCPServerFromConnectorCatalog: async (mcpServer: ConnectorCatalogEntry) => {
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
        const response = await installMcpServerFromCatalog({
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
}));

// Initialize catalog on store creation
useConnectorCatalogStore.getState().loadConnectorCatalog();
