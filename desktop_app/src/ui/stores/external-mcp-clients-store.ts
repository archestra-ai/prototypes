import { create } from 'zustand';

import {
  type ExternalMcpClient,
  ExternalMcpClientName,
  connectExternalMcpClient,
  disconnectExternalMcpClient,
  getConnectedExternalMcpClients,
  getSupportedExternalMcpClients,
} from '@ui/lib/clients/archestra/api/gen';

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

export const useExternalMcpClientsStore = create<ExternalMcpClientsStore>((set, get) => ({
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

      const { data } = await getSupportedExternalMcpClients();
      set({ supportedExternalMcpClientNames: data });
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

      const { data } = await getConnectedExternalMcpClients();
      if (data) {
        set({ connectedExternalMcpClients: data });
      }
    } catch (error) {
      set({ errorLoadingConnectedExternalMcpClients: error as string });
    } finally {
      set({ isLoadingConnectedExternalMcpClients: false });
    }
  },

  connectExternalMcpClient: async (clientName: ExternalMcpClientName) => {
    try {
      set({
        isConnectingExternalMcpClient: true,
        errorConnectingExternalMcpClient: null,
      });

      await connectExternalMcpClient({ body: { clientName } });

      set({
        connectedExternalMcpClients: [
          ...get().connectedExternalMcpClients,
          {
            clientName,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } catch (error) {
      set({ errorConnectingExternalMcpClient: error as string });
    } finally {
      set({ isConnectingExternalMcpClient: false });
    }
  },

  disconnectExternalMcpClient: async (clientName: ExternalMcpClientName) => {
    try {
      set({
        isDisconnectingExternalMcpClient: true,
        errorDisconnectingExternalMcpClient: null,
      });

      await disconnectExternalMcpClient({ path: { clientName } });

      set({
        connectedExternalMcpClients: get().connectedExternalMcpClients.filter(
          (client) => client.clientName !== clientName
        ),
      });
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
