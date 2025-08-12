import { create } from 'zustand';

import {
  type McpRequestLog,
  type McpRequestLogStats,
  clearMcpRequestLogs,
  getMcpRequestLogById,
  getMcpRequestLogStats,
  getMcpRequestLogs,
} from '@ui/lib/clients/archestra/api/gen';
import { type McpRequestLogFilters } from '@ui/types';

interface McpLogsStore {
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
  resetFilters: () => void;
}

const initialFilters: McpRequestLogFilters = {};

export const useMcpLogsStore = create<McpLogsStore>((set, get) => ({
  // Initial state
  logs: [],
  totalPages: 0,
  currentPage: 1,
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
  setFilters: (filters: McpRequestLogFilters) => {
    set({ filters, currentPage: 1 }); // Reset to first page when filters change
    get().fetchLogs();
  },

  setPage: (page: number) => {
    set({ currentPage: page });
    get().fetchLogs();
  },

  setPageSize: (size: number) => {
    set({ pageSize: size, currentPage: 1 }); // Reset to first page when page size changes
    get().fetchLogs();
  },

  setSelectedLogId: (id: number | null) => {
    set({ selectedLogId: id });
    if (id !== null) {
      get().fetchLogById(id);
    } else {
      set({ selectedLog: null });
    }
  },

  setAutoRefresh: (autoRefresh: boolean) => {
    set({ autoRefresh });
  },

  setRefreshInterval: (refreshInterval: number) => {
    set({ refreshInterval });
  },

  fetchLogs: async () => {
    const { filters, currentPage, pageSize } = get();
    set({ isLoading: true, error: null });

    try {
      const { data } = await getMcpRequestLogs({
        query: {
          ...filters,
          page: currentPage,
          pageSize,
        },
      });

      if (data) {
        const { data: logs, total } = data;
        const totalPages = Math.ceil(total / pageSize);
        set({ logs, totalPages, isLoading: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  fetchLogById: async (id: number) => {
    try {
      // Get the log from current page if available
      const currentLog = get().logs.find((log) => log.id === id);
      if (currentLog) {
        const { data } = await getMcpRequestLogById({
          path: { id: String(id) },
        });

        if (data) {
          set({ selectedLog: data });
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
      const { data } = await getMcpRequestLogStats({
        query: filters,
      });

      if (data) {
        set({ stats: data });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
    }
  },

  clearLogs: async (clearAll = false) => {
    try {
      const { data } = await clearMcpRequestLogs({
        body: { clearAll },
      });

      if (data) {
        // Refresh the data after clearing
        await get().refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
    }
  },

  refresh: async () => {
    await Promise.all([get().fetchLogs(), get().fetchStats()]);
  },

  resetFilters: () => {
    set({ filters: initialFilters, currentPage: 1 });
    get().fetchLogs();
  },
}));

// Auto-refresh functionality
let refreshIntervalId: NodeJS.Timeout | null = null;

// Subscribe to auto-refresh changes
useMcpLogsStore.subscribe((state) => {
  if (state.autoRefresh && !refreshIntervalId) {
    refreshIntervalId = setInterval(() => {
      if (useMcpLogsStore.getState().autoRefresh) {
        useMcpLogsStore.getState().refresh();
      }
    }, state.refreshInterval * 1000);
  } else if (!state.autoRefresh && refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
