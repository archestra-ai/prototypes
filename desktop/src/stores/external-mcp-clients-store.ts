import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

interface ExternalMcpClient {
  id: number;
  client_name: string;
  is_connected: boolean;
  last_connected: string;
  config_path: string;
  created_at: string;
  updated_at: string;
}

interface ExternalMCPClientsState {
  supportedExternalMcpClientNames: string[];
  isLoadingSupportedExternalMcpClientNames: boolean;
  errorLoadingSupportedExternalMcpClientNames: string | null;
  connectedExternalMcpClients: ExternalMcpClient[];
  isLoadingConnectedExternalMcpClients: boolean;
  errorLoadingConnectedExternalMcpClients: string | null;
  isConnectingExternalMcpClient: boolean;
  errorConnectingExternalMcpClient: string | null;
  isDisconnectingExternalMcpClient: boolean;
  errorDisconnectingExternalMcpClient: string | null;
}

interface ExternalMCPClientsActions {
  connectExternalMcpClient: (clientName: string) => Promise<void>;
  disconnectExternalMcpClient: (clientId: string) => Promise<void>;
  loadSupportedClients: () => Promise<void>;
  loadConnectedClients: () => Promise<void>;
}

type ExternalMCPClientsStore = ExternalMCPClientsState & ExternalMCPClientsActions;

export const useExternalMCPClientsStore = create<ExternalMCPClientsStore>((set) => ({
  // State
  supportedExternalMcpClientNames: [],
  isLoadingSupportedExternalMcpClientNames: true,
  errorLoadingSupportedExternalMcpClientNames: null,
  connectedExternalMcpClients: [],
  isLoadingConnectedExternalMcpClients: true,
  errorLoadingConnectedExternalMcpClients: null,
  isConnectingExternalMcpClient: false,
  errorConnectingExternalMcpClient: null,
  isDisconnectingExternalMcpClient: false,
  errorDisconnectingExternalMcpClient: null,

  // Actions
  loadSupportedClients: async () => {
    try {
      set({
        isLoadingSupportedExternalMcpClientNames: true,
        errorLoadingSupportedExternalMcpClientNames: null,
      });

      const clients = await invoke<string[]>('get_supported_external_mcp_client_names');
      set({ supportedExternalMcpClientNames: clients });
    } catch (error) {
      set({ errorLoadingSupportedExternalMcpClientNames: error as string });
    } finally {
      set({ isLoadingSupportedExternalMcpClientNames: false });
    }
  },

  loadConnectedClients: async () => {
    try {
      set({
        isLoadingConnectedExternalMcpClients: true,
        errorLoadingConnectedExternalMcpClients: null,
      });

      const clients = await invoke<ExternalMcpClient[]>('get_connected_external_mcp_clients');
      set({ connectedExternalMcpClients: clients });
    } catch (error) {
      set({ errorLoadingConnectedExternalMcpClients: error as string });
    } finally {
      set({ isLoadingConnectedExternalMcpClients: false });
    }
  },

  connectExternalMcpClient: async (clientId: string) => {
    try {
      set({
        isConnectingExternalMcpClient: true,
        errorConnectingExternalMcpClient: null,
      });

      await invoke('connect_external_mcp_client', { clientId });

      // Refresh connected clients after successful connection
      await useExternalMCPClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorConnectingExternalMcpClient: error as string });
    } finally {
      set({ isConnectingExternalMcpClient: false });
    }
  },

  disconnectExternalMcpClient: async (clientId: string) => {
    try {
      set({
        isDisconnectingExternalMcpClient: true,
        errorDisconnectingExternalMcpClient: null,
      });

      await invoke('disconnect_external_mcp_client', { clientId });

      // Refresh connected clients after successful disconnection
      await useExternalMCPClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorDisconnectingExternalMcpClient: error as string });
    } finally {
      set({ isDisconnectingExternalMcpClient: false });
    }
  },
}));

// Initialize data on store creation
useExternalMCPClientsStore.getState().loadSupportedClients();
useExternalMCPClientsStore.getState().loadConnectedClients();
