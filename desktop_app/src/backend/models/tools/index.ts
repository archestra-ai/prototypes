import { and, eq, sql } from 'drizzle-orm';

import db from '@backend/database';
import { Tool, ToolAnalysisResult, ToolSchema, toolsTable } from '@backend/database/schema/tool';
import { OllamaClient } from '@backend/ollama';
import { McpTools } from '@backend/sandbox/sandboxedMcp';
import log from '@backend/utils/logger';

export class ToolModel {
  /**
   * Create or update a tool
   */
  static async upsert(data: Partial<Tool> & { id: string; mcp_server_id: string; name: string }): Promise<Tool> {
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
  static async upsertMany(
    tools: Array<Partial<Tool> & { id: string; mcp_server_id: string; name: string }>
  ): Promise<Tool[]> {
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

  /**
   * Analyze tools using Ollama and persist results
   */
  static async analyze(tools: McpTools, mcpServerId: string): Promise<void> {
    try {
      log.info(`Analyzing ${Object.keys(tools).length} tools for MCP server ${mcpServerId}`);

      // Prepare tools for analysis
      const toolsForAnalysis = Object.entries(tools).map(([name, tool]) => ({
        id: `${mcpServerId}__${name}`,
        name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      }));

      // Analyze tools in batches to avoid overwhelming the LLM
      const batchSize = 10;
      for (let i = 0; i < toolsForAnalysis.length; i += batchSize) {
        const batch = toolsForAnalysis.slice(i, i + batchSize);

        try {
          // Get analysis results from Ollama
          const analysisResults = await OllamaClient.analyzeTools(batch);

          // Persist results using bulk operation
          const toolsToUpsert = batch.map((toolData) => {
            const analysis = analysisResults[toolData.name];
            if (analysis) {
              return {
                id: toolData.id,
                mcp_server_id: mcpServerId,
                name: toolData.name,
                description: toolData.description,
                input_schema: toolData.inputSchema,
                ...analysis,
                analyzed_at: new Date().toISOString(),
              };
            } else {
              log.warn(`No analysis results for tool ${toolData.name}`);
              // Still save the tool, just without analysis results
              return {
                id: toolData.id,
                mcp_server_id: mcpServerId,
                name: toolData.name,
                description: toolData.description,
                input_schema: toolData.inputSchema,
              };
            }
          });

          await ToolModel.upsertMany(toolsToUpsert);
        } catch (error) {
          log.error(`Failed to analyze batch of tools:`, error);
          // Still save the tools without analysis results using bulk operation
          const toolsToUpsert = batch.map((toolData) => ({
            id: toolData.id,
            mcp_server_id: mcpServerId,
            name: toolData.name,
            description: toolData.description,
            input_schema: toolData.inputSchema,
          }));

          await ToolModel.upsertMany(toolsToUpsert);
        }
      }

      log.info(`Completed analysis of tools for MCP server ${mcpServerId}`);
    } catch (error) {
      log.error(`Failed to analyze tools for MCP server ${mcpServerId}:`, error);
      throw error;
    }
  }

  /**
   * Re-analyze tools that haven't been analyzed yet
   */
  static async reanalyzeUnanalyzedTools(mcpServerId: string): Promise<void> {
    try {
      const unanalyzedTools = await ToolModel.getUnanalyzedByMcpServerId(mcpServerId);

      if (unanalyzedTools.length === 0) {
        log.info(`No unanalyzed tools found for MCP server ${mcpServerId}`);
        return;
      }

      log.info(`Re-analyzing ${unanalyzedTools.length} unanalyzed tools for MCP server ${mcpServerId}`);

      // Convert to format expected by analyzeTools
      const toolsForAnalysis = unanalyzedTools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.input_schema,
      }));

      // Analyze in batches
      const batchSize = 10;
      for (let i = 0; i < toolsForAnalysis.length; i += batchSize) {
        const batch = toolsForAnalysis.slice(i, i + batchSize);

        try {
          const analysisResults = await OllamaClient.analyzeTools(batch);

          // Update tools with analysis results
          for (const tool of unanalyzedTools.slice(i, i + batchSize)) {
            const analysis = analysisResults[tool.name];
            if (analysis) {
              await ToolModel.updateAnalysisResults(tool.id, analysis);
            }
          }
        } catch (error) {
          log.error(`Failed to re-analyze batch of tools:`, error);
        }
      }
    } catch (error) {
      log.error(`Failed to re-analyze unanalyzed tools for MCP server ${mcpServerId}:`, error);
      throw error;
    }
  }
}
