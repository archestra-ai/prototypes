import { z } from 'zod/v4';

import { selectMcpRequestLogSchema } from '@backend/models/mcpRequestLog';

export type McpRequestLog = z.infer<typeof selectMcpRequestLogSchema>;

export type McpClientInfo = {
  userAgent?: string;
  clientName?: string;
  clientVersion?: string;
  clientPlatform?: string;
  [key: string]: unknown;
};

export type McpRequestLogFilters = {
  serverName?: string;
  method?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type McpRequestLogStats = {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  requestsPerServer: Record<string, number>;
};
