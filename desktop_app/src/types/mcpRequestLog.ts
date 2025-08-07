import {
  McpClientInfoSchema,
  McpRequestLogFiltersSchema,
  McpRequestLogFiltersWithPaginationSchema,
  McpRequestLogStatsSchema,
} from '@archestra/schemas';
import { z } from 'zod';

import { selectMcpRequestLogSchema } from '@backend/models/mcpRequestLog';

export type McpRequestLog = z.infer<typeof selectMcpRequestLogSchema>;

export type McpRequestLogFilters = z.infer<typeof McpRequestLogFiltersSchema>;
export type McpRequestLogFiltersWithPagination = z.infer<typeof McpRequestLogFiltersWithPaginationSchema>;

export type McpClientInfo = z.infer<typeof McpClientInfoSchema>;
export type McpRequestLogStats = z.infer<typeof McpRequestLogStatsSchema>;
