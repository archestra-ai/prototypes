import { and, eq, sql } from 'drizzle-orm';

import db from '@backend/database';
import { Tool, ToolAnalysisResult, ToolSchema, toolsTable } from '@backend/database/schema/tool';

export class ToolModel {
  /**
   * Create or update a tool
   */
  static async upsert(data: Partial<Tool> & { id: string }): Promise<Tool> {
    const [tool] = await db
      .insert(toolsTable)
      .values({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: toolsTable.id,
        set: {
          ...data,
          updated_at: new Date().toISOString(),
        },
      })
      .returning();

    return ToolSchema.parse(tool);
  }

  /**
   * Create or update multiple tools
   */
  static async upsertMany(tools: Array<Partial<Tool> & { id: string }>): Promise<Tool[]> {
    if (tools.length === 0) return [];

    const values = tools.map((tool) => ({
      ...tool,
      updated_at: new Date().toISOString(),
    }));

    const results = await db
      .insert(toolsTable)
      .values(values)
      .onConflictDoUpdate({
        target: toolsTable.id,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          input_schema: sql`excluded.input_schema`,
          is_read: sql`excluded.is_read`,
          is_write: sql`excluded.is_write`,
          idempotent: sql`excluded.idempotent`,
          reversible: sql`excluded.reversible`,
          analyzed_at: sql`excluded.analyzed_at`,
          updated_at: sql`excluded.updated_at`,
        },
      })
      .returning();

    return results.map((result) => ToolSchema.parse(result));
  }

  /**
   * Get a tool by ID
   */
  static async getById(id: string): Promise<Tool | null> {
    const result = await db.select().from(toolsTable).where(eq(toolsTable.id, id)).limit(1);

    if (result.length === 0) return null;
    return ToolSchema.parse(result[0]);
  }

  /**
   * Get tools by MCP server ID
   */
  static async getByMcpServerId(mcpServerId: string): Promise<Tool[]> {
    const results = await db.select().from(toolsTable).where(eq(toolsTable.mcp_server_id, mcpServerId));

    return results.map((result) => ToolSchema.parse(result));
  }

  /**
   * Get all tools
   */
  static async getAll(): Promise<Tool[]> {
    const results = await db.select().from(toolsTable);
    return results.map((result) => ToolSchema.parse(result));
  }

  /**
   * Update tool analysis results
   */
  static async updateAnalysisResults(id: string, analysisResults: ToolAnalysisResult): Promise<Tool | null> {
    const [result] = await db
      .update(toolsTable)
      .set({
        ...analysisResults,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where(eq(toolsTable.id, id))
      .returning();

    if (!result) return null;
    return ToolSchema.parse(result);
  }

  /**
   * Delete tools by MCP server ID
   */
  static async deleteByMcpServerId(mcpServerId: string): Promise<void> {
    await db.delete(toolsTable).where(eq(toolsTable.mcp_server_id, mcpServerId));
  }

  /**
   * Delete a tool by ID
   */
  static async deleteById(id: string): Promise<void> {
    await db.delete(toolsTable).where(eq(toolsTable.id, id));
  }

  /**
   * Check if tools exist for a given MCP server
   */
  static async existsForMcpServer(mcpServerId: string): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(toolsTable)
      .where(eq(toolsTable.mcp_server_id, mcpServerId));

    return result[0].count > 0;
  }

  /**
   * Get unanalyzed tools for a given MCP server
   */
  static async getUnanalyzedByMcpServerId(mcpServerId: string): Promise<Tool[]> {
    const results = await db
      .select()
      .from(toolsTable)
      .where(and(eq(toolsTable.mcp_server_id, mcpServerId), eq(toolsTable.analyzed_at, sql`null`)));

    return results.map((result) => ToolSchema.parse(result));
  }
}
