import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { mcpServersTable } from './mcpServer';

// Schema for tool analysis results
export const ToolAnalysisResultSchema = z.object({
  is_read: z.boolean(),
  is_write: z.boolean(),
  idempotent: z.boolean(),
  reversible: z.boolean(),
});

// Schema for tool metadata (from MCP)
export const ToolMetadataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.any()).optional(),
});

export const toolsTable = sqliteTable('tools', {
  id: integer().primaryKey({ autoIncrement: true }),
  /**
   * Reference to the MCP server this tool belongs to
   */
  mcpServerId: text()
    .notNull()
    .references(() => mcpServersTable.id, { onDelete: 'cascade' }),
  /**
   * Tool name (from MCP)
   */
  name: text().notNull(),
  /**
   * Tool metadata from MCP (description, input schema, etc.)
   */
  metadata: text({ mode: 'json' }).$type<z.infer<typeof ToolMetadataSchema>>().notNull(),
  /**
   * Analysis results from LLM
   */
  analysis: text({ mode: 'json' }).$type<z.infer<typeof ToolAnalysisResultSchema>>(),
  /**
   * Timestamp when the tool was first discovered
   */
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
  /**
   * Timestamp when the analysis was last updated
   */
  updatedAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Create Zod schemas for validation
export const SelectToolSchema = createSelectSchema(toolsTable).extend({
  metadata: ToolMetadataSchema,
  analysis: ToolAnalysisResultSchema.nullable(),
});

export const InsertToolSchema = createSelectSchema(toolsTable, {
  id: z.undefined(),
  createdAt: z.undefined(),
  updatedAt: z.undefined(),
}).extend({
  metadata: ToolMetadataSchema,
  analysis: ToolAnalysisResultSchema.optional(),
});

export type Tool = z.infer<typeof SelectToolSchema>;
export type InsertTool = z.infer<typeof InsertToolSchema>;
export type ToolAnalysisResult = z.infer<typeof ToolAnalysisResultSchema>;
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;
