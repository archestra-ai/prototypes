import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import db from '@backend/database';
import { McpClientInfoSchema, SelectMcpRequestLogSchema, mcpRequestLogs } from '@backend/database/schema/mcpRequestLog';

export const McpRequestLogFiltersSchema = z.object({
  serverName: z.string().optional(),
  method: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export const McpRequestLogStatsSchema = z.object({
  totalRequests: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  avgDurationMs: z.number(),
  requestsPerServer: z.record(z.string(), z.number()),
});

export type McpRequestLogFilters = z.infer<typeof McpRequestLogFiltersSchema>;
export type McpRequestLogStats = z.infer<typeof McpRequestLogStatsSchema>;
export type McpClientInfo = z.infer<typeof McpClientInfoSchema>;

export default class McpRequestLog {
  /**
   * Create a new request log entry
   */
  static async create(data: typeof mcpRequestLogs.$inferInsert) {
    const [log] = await db.insert(mcpRequestLogs).values(data).returning();
    return log;
  }

  /**
   * Get request logs with filtering and pagination
   */
  static async getRequestLogs(filters?: McpRequestLogFilters, page: number = 1, pageSize: number = 50) {
    const offset = (page - 1) * pageSize;
    const conditions = [];

    if (filters) {
      if (filters.serverName) {
        conditions.push(eq(mcpRequestLogs.serverName, filters.serverName));
      }
      if (filters.method) {
        conditions.push(eq(mcpRequestLogs.method, filters.method));
      }
      if (filters.status) {
        if (filters.status === 'success') {
          conditions.push(gte(mcpRequestLogs.statusCode, 200));
          conditions.push(lte(mcpRequestLogs.statusCode, 299));
        } else if (filters.status === 'error') {
          conditions.push(gte(mcpRequestLogs.statusCode, 400));
        }
      }
      if (filters.dateFrom) {
        conditions.push(gte(mcpRequestLogs.timestamp, filters.dateFrom));
      }
      if (filters.dateTo) {
        conditions.push(lte(mcpRequestLogs.timestamp, filters.dateTo));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const totalCount = await db
      .select({ count: mcpRequestLogs.id })
      .from(mcpRequestLogs)
      .where(whereClause)
      .then((result) => result.length);

    const totalPages = Math.ceil(totalCount / pageSize);

    // Get paginated results
    const results = await db
      .select()
      .from(mcpRequestLogs)
      .where(whereClause)
      .orderBy(desc(mcpRequestLogs.timestamp))
      .limit(pageSize)
      .offset(offset);

    return { logs: results, totalPages };
  }

  /**
   * Get a single request log by ID
   */
  static async getRequestLogById(id: number) {
    const [log] = await db.select().from(mcpRequestLogs).where(eq(mcpRequestLogs.id, id));
    return log;
  }

  /**
   * Get summary statistics for request logs
   */
  static async getRequestLogStats(filters?: McpRequestLogFilters): Promise<McpRequestLogStats> {
    const conditions = [];

    if (filters) {
      if (filters.serverName) {
        conditions.push(eq(mcpRequestLogs.serverName, filters.serverName));
      }
      if (filters.method) {
        conditions.push(eq(mcpRequestLogs.method, filters.method));
      }
      if (filters.status) {
        if (filters.status === 'success') {
          conditions.push(gte(mcpRequestLogs.statusCode, 200));
          conditions.push(lte(mcpRequestLogs.statusCode, 299));
        } else if (filters.status === 'error') {
          conditions.push(gte(mcpRequestLogs.statusCode, 400));
        }
      }
      if (filters.dateFrom) {
        conditions.push(gte(mcpRequestLogs.timestamp, filters.dateFrom));
      }
      if (filters.dateTo) {
        conditions.push(lte(mcpRequestLogs.timestamp, filters.dateTo));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const allLogs = await db.select().from(mcpRequestLogs).where(whereClause);

    const totalRequests = allLogs.length;
    const successCount = allLogs.filter((log) => log.statusCode >= 200 && log.statusCode < 300).length;
    const errorCount = totalRequests - successCount;

    const totalDuration = allLogs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
    const avgDurationMs = totalRequests > 0 ? totalDuration / totalRequests : 0;

    const requestsPerServer: Record<string, number> = {};
    allLogs.forEach((log) => {
      requestsPerServer[log.serverName] = (requestsPerServer[log.serverName] || 0) + 1;
    });

    return {
      totalRequests,
      successCount,
      errorCount,
      avgDurationMs,
      requestsPerServer,
    };
  }

  /**
   * Clean up old logs (older than specified days)
   */
  static async cleanupOldLogs(retentionDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db.delete(mcpRequestLogs).where(lte(mcpRequestLogs.timestamp, cutoffDate.toISOString()));

    return result.changes;
  }

  /**
   * Clear all logs
   */
  static async clearAllLogs(): Promise<number> {
    const result = await db.delete(mcpRequestLogs);
    return result.changes;
  }
}

export { SelectMcpRequestLogSchema as McpRequestLogSchema };
