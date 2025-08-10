import { create } from 'zustand';

import { type SandboxStatusSummary as SandboxStatusSummaryWebSocketPayload } from '@ui/lib/clients/archestra/api/gen';
import websocketService from '@ui/lib/websocket';

import { useMcpServersStore } from './mcp-servers-store';

type SandboxStatusSummary = Omit<SandboxStatusSummaryWebSocketPayload, 'containers'>;

interface SandboxState {
  statusSummary: SandboxStatusSummary;
  isRunning: boolean;
}

interface SandboxActions {
  _updateStateFromStatusSummary: (statusSummary: SandboxStatusSummaryWebSocketPayload) => void;
}

type SandboxStore = SandboxState & SandboxActions;

export const useSandboxStore = create<SandboxStore>((set, _get) => ({
  // Initial state
  isRunning: false,
  statusSummary: {
    status: 'not_installed',
    runtime: {
      startupPercentage: 0,
      startupMessage: null,
      startupError: null,
      baseImage: {
        pullPercentage: 0,
        pullMessage: null,
        pullError: null,
      },
    },
  },

  _updateStateFromStatusSummary: (payload: SandboxStatusSummaryWebSocketPayload) => {
    const { updateMcpServer } = useMcpServersStore.getState();
    const { containers, ...statusSummary } = payload;

    set({
      statusSummary,
      isRunning: statusSummary.status === 'running',
    });

    /**
     * Update the MCP server statuses based on the latest update we just received
     */
    Object.entries(containers).forEach(([mcpServerId, container]) => {
      updateMcpServer(mcpServerId, container);
    });
  },
}));

// WebSocket event subscriptions
let unsubscribers: Array<() => void> = [];

const subscribeToWebSocketEvents = () => {
  unsubscribers.push(
    websocketService.subscribe('sandbox-status-update', ({ payload }) => {
      useSandboxStore.getState()._updateStateFromStatusSummary(payload);
    })
  );
};

// Initialize WebSocket subscriptions when the store is created
subscribeToWebSocketEvents();

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });
}
