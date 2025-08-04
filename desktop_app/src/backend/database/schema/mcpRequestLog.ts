import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mcpRequestLogs = sqliteTable('mcp_request_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: text('request_id').unique().notNull(),
  sessionId: text('session_id'),
  mcpSessionId: text('mcp_session_id'),
  serverName: text('server_name').notNull(),
  clientInfo: text('client_info'), // JSON string
  method: text('method'),
  requestHeaders: text('request_headers'), // JSON string
  requestBody: text('request_body'),
  responseBody: text('response_body'),
  responseHeaders: text('response_headers'), // JSON string
  statusCode: integer('status_code').notNull(),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
});