import { create } from 'zustand';

import {
  type ExternalMcpClient,
  connectExternalMcpClient,
  disconnectExternalMcpClient,
  getConnectedExternalMcpClients,
  getSupportedExternalMcpClients,
} from '@ui/lib/api-client';

interface ExternalMCPClientsState {
  supportedExternalMCPClientNames: string[];
  isLoadingSupportedExternalMCPClientNames: boolean;
  errorLoadingSupportedExternalMCPClientNames: string | null;
  connectedExternalMCPClients: ExternalMcpClient[];
  isLoadingConnectedExternalMCPClients: boolean;
  errorLoadingConnectedExternalMCPClients: string | null;
  isConnectingExternalMCPClient: boolean;
  errorConnectingExternalMCPClient: string | null;
  isDisconnectingExternalMCPClient: boolean;
  errorDisconnectingExternalMCPClient: string | null;
}

interface ExternalMCPClientsActions {
  connectExternalMCPClient: (clientName: string) => Promise<void>;
  disconnectExternalMCPClient: (clientName: string) => Promise<void>;
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

      const response = await getSupportedExternalMcpClients();
      if ('data' in response && response.data) {
        set({ supportedExternalMCPClientNames: response.data });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
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

      const response = await getConnectedExternalMcpClients();
      if ('data' in response && response.data) {
        set({ connectedExternalMCPClients: response.data });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      set({ errorLoadingConnectedExternalMCPClients: error as string });
    } finally {
      set({ isLoadingConnectedExternalMCPClients: false });
    }
  },

  connectExternalMCPClient: async (clientName: string) => {
    try {
      set({
        isConnectingExternalMCPClient: true,
        errorConnectingExternalMCPClient: null,
      });

      const response = await connectExternalMcpClient({
        body: { client_name: clientName },
      });
      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Refresh connected clients after successful connection
      await useExternalMCPClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorConnectingExternalMCPClient: error as string });
    } finally {
      set({ isConnectingExternalMCPClient: false });
    }
  },

  disconnectExternalMCPClient: async (clientName: string) => {
    try {
      set({
        isDisconnectingExternalMCPClient: true,
        errorDisconnectingExternalMCPClient: null,
      });

      const response = await disconnectExternalMcpClient({
        path: { client_name: clientName },
      });
      if ('error' in response) {
        throw new Error(response.error as string);
      }

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
