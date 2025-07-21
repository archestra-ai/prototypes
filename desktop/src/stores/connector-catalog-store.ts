import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { MCPServer, ServerConfig } from '@/types';

import { useMCPServersStore } from './mcp-servers-store';

interface OAuthConfig {
  provider: string;
  required: boolean;
}

interface ConnectorCatalogEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  version: string;
  homepage: string;
  repository: string;
  oauth?: OAuthConfig;
  server_config: ServerConfig;
  image?: string;
}

interface ConnectorCatalogState {
  connectorCatalog: ConnectorCatalogEntry[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;
  installingMcpServerName: string | null;
  errorInstallingMcpServer: string | null;
  uninstallingMcpServerName: string | null;
  errorUninstallingMcpServer: string | null;
}

interface ConnectorCatalogActions {
  installMcpServerFromConnectorCatalog: (mcpServer: ConnectorCatalogEntry) => Promise<void>;
  uninstallMcpServer: (mcpServerName: string) => Promise<void>;
  loadConnectorCatalog: () => Promise<void>;
}

type ConnectorCatalogStore = ConnectorCatalogState & ConnectorCatalogActions;

export const useConnectorCatalogStore = create<ConnectorCatalogStore>((set) => ({
  // State
  connectorCatalog: [],
  loadingConnectorCatalog: false,
  errorFetchingConnectorCatalog: null,
  installingMcpServerName: null,
  errorInstallingMcpServer: null,
  uninstallingMcpServerName: null,
  errorUninstallingMcpServer: null,

  // Actions
  loadConnectorCatalog: async () => {
    try {
      set({
        loadingConnectorCatalog: true,
        errorFetchingConnectorCatalog: null,
      });

      const catalogData = await invoke<ConnectorCatalogEntry[]>('get_mcp_connector_catalog');
      set({
        connectorCatalog: catalogData.map((entry) => ({
          ...entry,
          tools: [],
        })),
      });
    } catch (error) {
      set({ errorFetchingConnectorCatalog: error as string });
    } finally {
      set({ loadingConnectorCatalog: false });
    }
  },

  installMcpServerFromConnectorCatalog: async (mcpServer: ConnectorCatalogEntry) => {
    const { oauth, title, id } = mcpServer;

    try {
      set({
        installingMcpServerName: mcpServer.title,
        errorInstallingMcpServer: null,
      });

      // Check if OAuth is required
      if (oauth?.required) {
        try {
          // Start OAuth flow
          await invoke('start_oauth_auth', { service: id });

          // For OAuth connectors, the backend will handle the installation after successful auth
          alert(`OAuth setup started for ${title}. Please complete the authentication in your browser.`);
        } catch (error) {
          set({ errorInstallingMcpServer: error as string });
        }
      } else {
        const result = await invoke<MCPServer>('save_mcp_server_from_catalog', { connectorId: id });

        // Add to MCP servers store
        useMCPServersStore.getState().addMCPServerToInstalledMCPServers(result);
      }
    } catch (error) {
      set({ errorInstallingMcpServer: error as string });
    } finally {
      set({ installingMcpServerName: null });
    }
  },

  uninstallMcpServer: async (mcpServerName: string) => {
    try {
      set({
        uninstallingMcpServerName: mcpServerName,
        errorUninstallingMcpServer: null,
      });

      await invoke('uninstall_mcp_server', { name: mcpServerName });

      // Remove from MCP servers store
      useMCPServersStore.getState().removeMCPServerFromInstalledMCPServers(mcpServerName);
    } catch (error) {
      set({ errorUninstallingMcpServer: error as string });
    } finally {
      set({ uninstallingMcpServerName: null });
    }
  },
}));

// Initialize catalog on store creation
useConnectorCatalogStore.getState().loadConnectorCatalog();
