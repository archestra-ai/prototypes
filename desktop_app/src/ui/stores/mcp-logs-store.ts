import { create } from 'zustand';

import {
  type McpClientInfo,
  type McpRequestLog,
  type McpRequestLogFilters,
  type McpRequestLogStats,
  clearMcpRequestLogs,
  getMcpRequestLogById,
  getMcpRequestLogStats,
  getMcpRequestLogs,
} from '@clients/archestra/api/gen';

interface MCPLogsStore {
  // State
  logs: McpRequestLog[];
  totalPages: number;
  currentPage: number;
  pageSize: number;
  filters: McpRequestLogFilters;
  stats: McpRequestLogStats | null;
  isLoading: boolean;
  error: string | null;
  selectedLogId: number | null;
  selectedLog: McpRequestLog | null;
  autoRefresh: boolean;
  refreshInterval: number; // in seconds

  // Actions
  setFilters: (filters: McpRequestLogFilters) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSelectedLogId: (id: number | null) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  fetchLogs: () => Promise<void>;
  fetchLogById: (id: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  clearLogs: (clearAll?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  parseClientInfo: (clientInfoJson?: string) => McpClientInfo | null;
  parseHeaders: (headersJson?: string) => Record<string, string> | null;
  resetFilters: () => void;
}

const initialFilters: McpRequestLogFilters = {};

export const useMCPLogsStore = create<MCPLogsStore>((set, get) => ({
  // Initial state
  logs: [],
  totalPages: 0,
  currentPage: 0,
  pageSize: 20,
  filters: initialFilters,
  stats: null,
  isLoading: false,
  error: null,
  selectedLogId: null,
  selectedLog: null,
  autoRefresh: false,
  refreshInterval: 30, // 30 seconds

  // Actions
  setFilters: (filters) => {
    set({ filters, currentPage: 0 }); // Reset to first page when filters change
    get().fetchLogs();
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().fetchLogs();
  },

  setPageSize: (size) => {
    set({ pageSize: size, currentPage: 0 }); // Reset to first page when page size changes
    get().fetchLogs();
  },

  setSelectedLogId: (id) => {
    set({ selectedLogId: id });
    if (id !== null) {
      get().fetchLogById(id);
    } else {
      set({ selectedLog: null });
    }
  },

  setAutoRefresh: (enabled) => {
    set({ autoRefresh: enabled });
  },

  setRefreshInterval: (interval) => {
    set({ refreshInterval: interval });
  },

  fetchLogs: async () => {
    const { filters, currentPage, pageSize } = get();
    set({ isLoading: true, error: null });

    try {
      const response = await getMcpRequestLogs({
        query: {
          ...filters,
          page: currentPage,
          page_size: pageSize,
        },
      });

      if ('data' in response && response.data) {
        const { data: logs, total } = response.data;
        const totalPages = Math.ceil(total / pageSize);
        set({ logs, totalPages, isLoading: false });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  fetchLogById: async (id) => {
    try {
      // Get the log from current page if available
      const currentLog = get().logs.find((log) => log.id === id);
      if (currentLog) {
        const response = await getMcpRequestLogById({
          path: { request_id: currentLog.request_id },
        });

        if ('data' in response && response.data) {
          set({ selectedLog: response.data });
        } else if ('error' in response) {
          throw new Error(response.error as string);
        }
      } else {
        set({ selectedLog: null });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
    }
  },

  fetchStats: async () => {
    const { filters } = get();
    try {
      const response = await getMcpRequestLogStats({
        query: filters,
      });

      if ('data' in response && response.data) {
        set({ stats: response.data });
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
    }
  },

  clearLogs: async (clearAll = false) => {
    try {
      const response = await clearMcpRequestLogs({
        query: { clear_all: clearAll },
      });

      if ('data' in response && response.data !== undefined) {
        // Refresh the data after clearing
        await get().refresh();
      } else if ('error' in response) {
        throw new Error(response.error as string);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
    }
  },

  refresh: async () => {
    await Promise.all([get().fetchLogs(), get().fetchStats()]);
  },

  parseClientInfo: (clientInfoJson) => {
    if (!clientInfoJson) return null;
    try {
      return JSON.parse(clientInfoJson) as McpClientInfo;
    } catch {
      return null;
    }
  },

  parseHeaders: (headersJson) => {
    if (!headersJson) return null;
    try {
      return JSON.parse(headersJson) as Record<string, string>;
    } catch {
      return null;
    }
  },

  resetFilters: () => {
    set({ filters: initialFilters, currentPage: 0 });
    get().fetchLogs();
  },
}));

// Auto-refresh functionality
let refreshIntervalId: NodeJS.Timeout | null = null;

// Subscribe to auto-refresh changes
useMCPLogsStore.subscribe((state) => {
  if (state.autoRefresh && !refreshIntervalId) {
    refreshIntervalId = setInterval(() => {
      if (useMCPLogsStore.getState().autoRefresh) {
        useMCPLogsStore.getState().refresh();
      }
    }, state.refreshInterval * 1000);
  } else if (!state.autoRefresh && refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
