export interface McpRequestLog {
  id: string;
  request_id?: string;
  session_id?: string;
  mcp_session_id?: string;
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

export interface CreateMcpRequestLogData {
  requestId: string;
  sessionId?: string;
  mcpSessionId?: string;
  serverName: string;
  clientInfo?: {
    userAgent?: string;
    clientName?: string;
    clientVersion?: string;
    clientPlatform?: string;
  };
  method?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  statusCode: number;
  errorMessage?: string;
  durationMs?: number;
}

export interface McpRequestLogStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  requestsPerServer: Record<string, number>;
}

export interface McpClientInfo {
  userAgent?: string;
  clientName?: string;
  clientVersion?: string;
  clientPlatform?: string;
  [key: string]: any;
}
