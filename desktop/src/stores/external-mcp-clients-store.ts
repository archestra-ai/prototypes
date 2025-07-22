import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

interface ExternalMCPClient {
  id: number;
  client_name: string;
  is_connected: boolean;
  last_connected: string;
  config_path: string;
  created_at: string;
  updated_at: string;
}

interface ExternalMCPClientsState {
  supportedExternalMCPClientNames: string[];
  isLoadingSupportedExternalMCPClientNames: boolean;
  errorLoadingSupportedExternalMCPClientNames: string | null;
  connectedExternalMCPClients: ExternalMCPClient[];
  isLoadingConnectedExternalMCPClients: boolean;
  errorLoadingConnectedExternalMCPClients: string | null;
  isConnectingExternalMCPClient: boolean;
  errorConnectingExternalMCPClient: string | null;
  isDisconnectingExternalMCPClient: boolean;
  errorDisconnectingExternalMCPClient: string | null;
}

interface ExternalMCPClientsActions {
  connectExternalMCPClient: (clientName: string) => Promise<void>;
  disconnectExternalMCPClient: (clientId: string) => Promise<void>;
  loadSupportedClients: () => Promise<void>;
  loadConnectedClients: () => Promise<void>;
}

type ExternalMCPClientsStore = ExternalMCPClientsState & ExternalMCPClientsActions;

export const useExternalMCPClientsStore = create<ExternalMCPClientsStore>((set) => ({
  // State
  supportedExternalMCPClientNames: [],
  isLoadingSupportedExternalMCPClientNames: true,
  errorLoadingSupportedExternalMCPClientNames: null,
  connectedExternalMCPClients: [],
  isLoadingConnectedExternalMCPClients: true,
  errorLoadingConnectedExternalMCPClients: null,
  isConnectingExternalMCPClient: false,
  errorConnectingExternalMCPClient: null,
  isDisconnectingExternalMCPClient: false,
  errorDisconnectingExternalMCPClient: null,

  // Actions
  loadSupportedClients: async () => {
    try {
      set({
        isLoadingSupportedExternalMCPClientNames: true,
        errorLoadingSupportedExternalMCPClientNames: null,
      });

      const clients = await invoke<string[]>('get_supported_external_mcp_client_names');
      set({ supportedExternalMCPClientNames: clients });
    } catch (error) {
      set({ errorLoadingSupportedExternalMCPClientNames: error as string });
    } finally {
      set({ isLoadingSupportedExternalMCPClientNames: false });
    }
  },

  loadConnectedClients: async () => {
    try {
      set({
        isLoadingConnectedExternalMCPClients: true,
        errorLoadingConnectedExternalMCPClients: null,
      });

      const clients = await invoke<ExternalMCPClient[]>('get_connected_external_mcp_clients');
      set({ connectedExternalMCPClients: clients });
    } catch (error) {
      set({ errorLoadingConnectedExternalMCPClients: error as string });
    } finally {
      set({ isLoadingConnectedExternalMCPClients: false });
    }
  },

  connectExternalMCPClient: async (clientId: string) => {
    try {
      set({
        isConnectingExternalMCPClient: true,
        errorConnectingExternalMCPClient: null,
      });

      await invoke('connect_external_mcp_client', { clientId });

      // Refresh connected clients after successful connection
      await useExternalMCPClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorConnectingExternalMCPClient: error as string });
    } finally {
      set({ isConnectingExternalMCPClient: false });
    }
  },

  disconnectExternalMCPClient: async (clientId: string) => {
    try {
      set({
        isDisconnectingExternalMCPClient: true,
        errorDisconnectingExternalMCPClient: null,
      });

      await invoke('disconnect_external_mcp_client', { clientId });

      // Refresh connected clients after successful disconnection
      await useExternalMCPClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorDisconnectingExternalMCPClient: error as string });
    } finally {
      set({ isDisconnectingExternalMCPClient: false });
    }
  },
}));

// Initialize data on store creation
useExternalMCPClientsStore.getState().loadSupportedClients();
useExternalMCPClientsStore.getState().loadConnectedClients();
