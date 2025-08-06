import { create } from 'zustand';

import { type ExternalMcpClient } from '@archestra/types';
import {
  connectExternalMcpClient,
  disconnectExternalMcpClient,
  getConnectedExternalMcpClients,
  getSupportedExternalMcpClients,
} from '@clients/archestra/api/gen';

interface ExternalMcpClientsState {
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

interface ExternalMcpClientsActions {
  connectExternalMcpClient: (clientName: string) => Promise<void>;
  disconnectExternalMcpClient: (clientName: string) => Promise<void>;
  loadSupportedClients: () => Promise<void>;
  loadConnectedClients: () => Promise<void>;
}

type ExternalMcpClientsStore = ExternalMcpClientsState & ExternalMcpClientsActions;

export const useExternalMcpClientsStore = create<ExternalMcpClientsStore>((set) => ({
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

      const response = await getSupportedExternalMcpClients();
      if ('data' in response && response.data) {
        set({ supportedExternalMcpClientNames: response.data as string[] });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
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

      const response = await getConnectedExternalMcpClients();
      if ('data' in response && response.data) {
        set({ connectedExternalMcpClients: response.data as ExternalMcpClient[] });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      set({ errorLoadingConnectedExternalMcpClients: error as string });
    } finally {
      set({ isLoadingConnectedExternalMcpClients: false });
    }
  },

  connectExternalMcpClient: async (clientName: string) => {
    try {
      set({
        isConnectingExternalMcpClient: true,
        errorConnectingExternalMcpClient: null,
      });

      const response = await connectExternalMcpClient({
        body: { client_name: clientName },
      });
      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Refresh connected clients after successful connection
      await useExternalMcpClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorConnectingExternalMcpClient: error as string });
    } finally {
      set({ isConnectingExternalMcpClient: false });
    }
  },

  disconnectExternalMcpClient: async (clientName: string) => {
    try {
      set({
        isDisconnectingExternalMcpClient: true,
        errorDisconnectingExternalMcpClient: null,
      });

      const response = await disconnectExternalMcpClient({
        path: { client_name: clientName },
      });
      if ('error' in response) {
        throw new Error(response.error as string);
      }

      // Refresh connected clients after successful disconnection
      await useExternalMcpClientsStore.getState().loadConnectedClients();
    } catch (error) {
      set({ errorDisconnectingExternalMcpClient: error as string });
    } finally {
      set({ isDisconnectingExternalMcpClient: false });
    }
  },
}));

// Initialize data on store creation
useExternalMcpClientsStore.getState().loadSupportedClients();
useExternalMcpClientsStore.getState().loadConnectedClients();
