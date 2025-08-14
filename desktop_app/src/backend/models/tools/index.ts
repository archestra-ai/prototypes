import { and, eq } from 'drizzle-orm';

import db from '@backend/database';
import { InsertTool, SelectToolSchema, Tool, ToolAnalysisResult, toolsTable } from '@backend/database/schema/tool';
import log from '@backend/utils/logger';

export default class ToolModel {
  /**
   * Get all tools for a specific MCP server
   */
  static async getToolsByMcpServerId(mcpServerId: string): Promise<Tool[]> {
    const tools = await db.select().from(toolsTable).where(eq(toolsTable.mcpServerId, mcpServerId));

    return tools.map((tool) => SelectToolSchema.parse(tool));
  }

  /**
   * Get a specific tool by MCP server ID and tool name
   */
  static async getToolByServerAndName(mcpServerId: string, toolName: string): Promise<Tool | null> {
    const [tool] = await db
      .select()
      .from(toolsTable)
      .where(and(eq(toolsTable.mcpServerId, mcpServerId), eq(toolsTable.name, toolName)))
      .limit(1);

    return tool ? SelectToolSchema.parse(tool) : null;
  }

  /**
   * Upsert tools for an MCP server (insert or update)
   */
  static async upsertTools(mcpServerId: string, tools: Omit<InsertTool, 'mcpServerId'>[]): Promise<Tool[]> {
    const results: Tool[] = [];

    for (const tool of tools) {
      try {
        // Check if tool already exists
        const existing = await this.getToolByServerAndName(mcpServerId, tool.name);

        if (existing) {
          // Update existing tool
          const [updated] = await db
            .update(toolsTable)
            .set({
              metadata: tool.metadata,
              analysis: tool.analysis,
              updatedAt: new Date().toISOString(),
            })
            .where(and(eq(toolsTable.mcpServerId, mcpServerId), eq(toolsTable.name, tool.name)))
            .returning();

          results.push(SelectToolSchema.parse(updated));
        } else {
          // Insert new tool
          const [inserted] = await db
            .insert(toolsTable)
            .values({
              ...tool,
              mcpServerId,
            })
            .returning();

          results.push(SelectToolSchema.parse(inserted));
        }
      } catch (error) {
        log.error(`Failed to upsert tool ${tool.name} for MCP server ${mcpServerId}:`, error);
      }
    }

    return results;
  }

  /**
   * Delete all tools for an MCP server
   */
  static async deleteToolsByMcpServerId(mcpServerId: string): Promise<void> {
    await db.delete(toolsTable).where(eq(toolsTable.mcpServerId, mcpServerId));
  }

  /**
   * Update tool analysis results
   */
  static async updateToolAnalysis(
    mcpServerId: string,
    toolName: string,
    analysis: ToolAnalysisResult | null
  ): Promise<Tool | null> {
    const [updated] = await db
      .update(toolsTable)
      .set({
        analysis,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(toolsTable.mcpServerId, mcpServerId), eq(toolsTable.name, toolName)))
      .returning();

    return updated ? SelectToolSchema.parse(updated) : null;
  }
}
