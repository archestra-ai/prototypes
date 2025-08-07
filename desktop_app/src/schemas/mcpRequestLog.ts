import { z } from 'zod';

export const McpRequestLogFiltersSchema = z.object({
  serverName: z.string().optional(),
  method: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const McpRequestLogFiltersWithPaginationSchema = McpRequestLogFiltersSchema.extend({
  page: z.number().min(1).default(1).optional(),
  pageSize: z.number().min(1).max(100).default(50).optional(),
});

export const McpClientInfoSchema = z.object({
  userAgent: z.string().optional(),
  clientName: z.string().optional(),
  clientVersion: z.string().optional(),
  clientPlatform: z.string().optional(),
});

export const McpRequestLogStatsSchema = z.object({
  totalRequests: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  avgDurationMs: z.number(),
  requestsPerServer: z.record(z.string(), z.number()),
});
