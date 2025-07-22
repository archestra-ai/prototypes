import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

// Types matching the Rust backend
export interface ClientInfo {
  user_agent?: string;
  client_name?: string;
  client_version?: string;
  client_platform?: string;
}

export interface MCPRequestLog {
  id: number;
  request_id: string;
  session_id?: string;
  mcp_session_id?: string;
  server_name: string;
  client_info?: string; // JSON string
  method?: string;
  request_headers?: string; // JSON string
  request_body?: string;
  response_body?: string;
  response_headers?: string; // JSON string
  status_code: number;
  error_message?: string;
  duration_ms?: number;
  timestamp: string;
}

export interface LogFilters {
  server_name?: string;
  session_id?: string;
  mcp_session_id?: string;
  status_code?: number;
  method?: string;
  start_time?: string;
  end_time?: string;
}

export interface LogStats {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_duration_ms: number;
  requests_per_server: Record<string, number>;
}

interface MCPLogsStore {
  // State
  logs: MCPRequestLog[];
  totalPages: number;
  currentPage: number;
  pageSize: number;
  filters: LogFilters;
  stats: LogStats | null;
  isLoading: boolean;
  error: string | null;
  selectedLogId: number | null;
  selectedLog: MCPRequestLog | null;
  autoRefresh: boolean;
  refreshInterval: number; // in seconds

  // Actions
  setFilters: (filters: LogFilters) => void;
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
  parseClientInfo: (clientInfoJson?: string) => ClientInfo | null;
  parseHeaders: (headersJson?: string) => Record<string, string> | null;
  resetFilters: () => void;
}

const initialFilters: LogFilters = {};

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
      const result: [MCPRequestLog[], number] = await invoke('get_mcp_request_logs', {
        filters: Object.keys(filters).length > 0 ? filters : null,
        page: currentPage,
        pageSize,
      });

      const [logs, totalPages] = result;
      set({ logs, totalPages, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      console.error('Failed to fetch MCP logs:', error);
    }
  },

  fetchLogById: async (id) => {
    try {
      const log: MCPRequestLog | null = await invoke('get_mcp_request_log_by_id', { id });
      set({ selectedLog: log });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
      console.error('Failed to fetch MCP log by ID:', error);
    }
  },

  fetchStats: async () => {
    const { filters } = get();
    try {
      const stats: LogStats = await invoke('get_mcp_request_log_stats', {
        filters: Object.keys(filters).length > 0 ? filters : null,
      });
      set({ stats });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
      console.error('Failed to fetch MCP log stats:', error);
    }
  },

  clearLogs: async (clearAll = false) => {
    try {
      const clearedCount: number = await invoke('clear_mcp_request_logs', { clearAll });
      console.log(`Cleared ${clearedCount} log entries`);

      // Refresh the data after clearing
      await get().refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage });
      console.error('Failed to clear MCP logs:', error);
    }
  },

  refresh: async () => {
    await Promise.all([get().fetchLogs(), get().fetchStats()]);
  },

  parseClientInfo: (clientInfoJson) => {
    if (!clientInfoJson) return null;
    try {
      return JSON.parse(clientInfoJson) as ClientInfo;
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

// Helper functions for use in components
export const formatDuration = (durationMs?: number): string => {
  if (!durationMs) return 'N/A';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString();
};

export const getStatusColor = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'text-green-500 dark:text-green-400';
  if (statusCode >= 400 && statusCode < 500) return 'text-yellow-500 dark:text-yellow-400';
  if (statusCode >= 500) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
};

export const getStatusLabel = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'Success';
  if (statusCode >= 400 && statusCode < 500) return 'Client Error';
  if (statusCode >= 500) return 'Server Error';
  return 'Unknown';
};
