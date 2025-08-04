import { and, desc, eq, gte, lte } from 'drizzle-orm';

import db from '@backend/database';
import { mcpRequestLogs } from '@backend/database/schema/mcpRequestLog';
import { CreateMcpRequestLogData, McpRequestLog, McpRequestLogFilters, McpRequestLogStats } from '@types';

export class MCPRequestLog {
  /**
   * Create a new request log entry
   */
  static async create(data: CreateMcpRequestLogData): Promise<McpRequestLog> {
    const [log] = await db
      .insert(mcpRequestLogs)
      .values({
        requestId: data.requestId,
        sessionId: data.sessionId,
        mcpSessionId: data.mcpSessionId,
        serverName: data.serverName,
        clientInfo: data.clientInfo ? JSON.stringify(data.clientInfo) : null,
        method: data.method,
        requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : null,
        requestBody: data.requestBody,
        responseBody: data.responseBody,
        responseHeaders: data.responseHeaders ? JSON.stringify(data.responseHeaders) : null,
        statusCode: data.statusCode,
        errorMessage: data.errorMessage,
        durationMs: data.durationMs,
      })
      .returning();

    return this.toMcpRequestLog(log);
  }

  /**
   * Get request logs with filtering and pagination
   */
  static async getRequestLogs(
    filters?: McpRequestLogFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ logs: McpRequestLog[]; totalPages: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = [];

    if (filters) {
      if (filters.server_name) {
        conditions.push(eq(mcpRequestLogs.serverName, filters.server_name));
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
      if (filters.date_from) {
        conditions.push(gte(mcpRequestLogs.timestamp, filters.date_from));
      }
      if (filters.date_to) {
        conditions.push(lte(mcpRequestLogs.timestamp, filters.date_to));
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

    const logs = results.map((log) => this.toMcpRequestLog(log));

    return { logs, totalPages };
  }

  /**
   * Get a single request log by ID
   */
  static async getRequestLogById(id: number): Promise<McpRequestLog | null> {
    const [log] = await db.select().from(mcpRequestLogs).where(eq(mcpRequestLogs.id, id));
    return log ? this.toMcpRequestLog(log) : null;
  }

  /**
   * Get summary statistics for request logs
   */
  static async getRequestLogStats(filters?: McpRequestLogFilters): Promise<McpRequestLogStats> {
    const conditions = [];

    if (filters) {
      if (filters.server_name) {
        conditions.push(eq(mcpRequestLogs.serverName, filters.server_name));
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
      if (filters.date_from) {
        conditions.push(gte(mcpRequestLogs.timestamp, filters.date_from));
      }
      if (filters.date_to) {
        conditions.push(lte(mcpRequestLogs.timestamp, filters.date_to));
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

  /**
   * Convert database row to McpRequestLog type
   */
  private static toMcpRequestLog(row: typeof mcpRequestLogs.$inferSelect): McpRequestLog {
    return {
      id: row.id.toString(),
      request_id: row.requestId,
      session_id: row.sessionId,
      mcp_session_id: row.mcpSessionId,
      server_name: row.serverName,
      client_info: row.clientInfo,
      method: row.method,
      status: row.statusCode >= 200 && row.statusCode < 300 ? 'success' : 'error',
      duration_ms: row.durationMs,
      timestamp: row.timestamp,
      request: row.requestBody ? row.requestBody : undefined,
      response: row.responseBody ? row.responseBody : undefined,
      error: row.errorMessage,
      headers: row.requestHeaders ? JSON.parse(row.requestHeaders) : undefined,
    };
  }
}
