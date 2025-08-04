export interface McpRequestLog {
  id: string;
  client_info?: string;
  server_name: string;
  method: string;
  status: 'pending' | 'success' | 'error';
  duration_ms?: number;
  timestamp: string;
  request?: unknown;
  response?: unknown;
  error?: string;
  headers?: Record<string, string>;
}

export interface McpRequestLogFilters {
  server_name?: string;
  method?: string;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}