import { create } from 'zustand';

import { type SandboxStatus, getSandboxStatus } from '@ui/lib/clients/archestra/api/gen';
import { McpServerStatus } from '@ui/types/mcpServer';

import { useMcpServersStore } from './mcp-servers-store';

interface SandboxState {
  // Overall sandbox status
  isInitialized: boolean;
  initializationError: string | null;
  sandboxStatus: Omit<SandboxStatus, 'mcpServerContainerStatuses'>;

  // Podman runtime progress
  podmanMachineProgress: number;
  podmanMachineMessage: string | null;

  // Base image status
  isFetchingBaseImage: boolean;
  baseImageFetched: boolean;
}

interface SandboxActions {
  fetchStatus: () => Promise<void>;
  _pollSandboxStatus: () => Promise<void>;
}

type SandboxStore = SandboxState & SandboxActions;

export const useSandboxStore = create<SandboxStore>((set, get) => ({
  // Initial state
  isInitialized: false,
  initializationError: null,
  sandboxStatus: {
    isInitialized: false,
    podmanMachineStatus: 'not_installed',
    mcpServerContainerStatuses: {},
  },
  podmanMachineProgress: 0,
  podmanMachineMessage: null,
  isFetchingBaseImage: false,
  baseImageFetched: false,

  // Actions
  fetchStatus: async () => {
    try {
      const { data } = await getSandboxStatus();
      if (data) {
        set({
          isInitialized: data.isInitialized,
          sandboxStatus: data,
        });

        const { updateMcpServer } = useMcpServersStore.getState();

        Object.entries(data.mcpServerContainerStatuses).forEach(([mcpServerId, status]) => {
          /**
           * TODO: we could also update the mcp server's "error" field with some more descriptive
           * string error message that the backend sandbox manager (could) provide
           */
          updateMcpServer(mcpServerId, {
            status: status.running ? McpServerStatus.Connected : McpServerStatus.Error,
          });
        });
      }
    } catch (error) {
      console.error('Failed to fetch sandbox status:', error);
    }
  },

  _pollSandboxStatus: async () => {
    await get().fetchStatus();
    setTimeout(() => get()._pollSandboxStatus(), 3000);
  },
}));

/**
 * Fetch initial status on store creation
 * and then infinitely do periodic polling for updates every 3 seconds
 */
useSandboxStore.getState()._pollSandboxStatus();

// TODO: get websocket events working instead of just polling for now
// WebSocket event subscriptions
// let unsubscribers: Array<() => void> = [];

// const subscribeToWebSocketEvents = () => {
//   // Cleanup any existing subscriptions
//   unsubscribers.forEach((unsubscribe) => unsubscribe());
//   unsubscribers = [];

//   const store = useSandboxStore.getState();

//   // Sandbox startup started
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-startup-started', () => {
//       useSandboxStore.setState({
//         initializationError: null,
//       });
//     })
//   );

//   // Sandbox startup completed
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-startup-completed', (message) => {
//       useSandboxStore.setState({
//         isInitialized: true,
//       });
//     })
//   );

//   // Sandbox startup failed
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-startup-failed', (message) => {
//       useSandboxStore.setState({
//         initializationError: message.payload.error,
//       });
//     })
//   );

//   // Podman runtime progress
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-podman-runtime-progress', (message) => {
//       useSandboxStore.setState({
//         podmanMachineProgress: message.payload.percentage,
//         podmanMachineMessage: message.payload.message || null,
//       });
//     })
//   );

//   // Base image fetch started
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-base-image-fetch-started', () => {
//       useSandboxStore.setState({
//         isFetchingBaseImage: true,
//         baseImageFetched: false,
//       });
//     })
//   );

//   // Base image fetch failed
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-base-image-fetch-failed', (message) => {
//       useSandboxStore.setState({
//         initializationError: message.payload.error,
//         isFetchingBaseImage: false,
//       });
//     })
//   );

//   // Base image fetch completed
//   unsubscribers.push(
//     websocketService.subscribe('sandbox-base-image-fetch-completed', () => {
//       useSandboxStore.setState({
//         isFetchingBaseImage: false,
//         baseImageFetched: true,
//       });
//     })
//   );
// };

// // Initialize WebSocket subscriptions when the store is created
// subscribeToWebSocketEvents();

// // Connect to WebSocket when store is created
// websocketService.connect().catch(console.error);

// Cleanup on window unload
// if (typeof window !== 'undefined') {
//   window.addEventListener('beforeunload', () => {
//     unsubscribers.forEach((unsubscribe) => unsubscribe());
//   });
// }
