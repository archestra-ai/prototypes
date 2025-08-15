import { and, eq } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import db from '@backend/database';
import { tools } from '@backend/database/schema/tool';
import log from '@backend/utils/logger';

export const InsertToolSchema = createInsertSchema(tools, {
  inputSchema: z.string().optional(),
  isRead: z.boolean().optional(),
  isWrite: z.boolean().optional(),
  idempotent: z.boolean().optional(),
  reversible: z.boolean().optional(),
});

export const SelectToolSchema = createSelectSchema(tools);

export const ToolAnalysisResultSchema = z.object({
  is_read: z.boolean(),
  is_write: z.boolean(),
  idempotent: z.boolean(),
  reversible: z.boolean(),
});

export type InsertTool = z.infer<typeof InsertToolSchema>;
export type Tool = z.infer<typeof SelectToolSchema>;
export type ToolAnalysisResult = z.infer<typeof ToolAnalysisResultSchema>;

class ToolModel {
  /**
   * Get all tools
   */
  async getAll(): Promise<Tool[]> {
    return db.select().from(tools);
  }

  /**
   * Get tools by MCP server ID
   */
  async getByMcpServerId(mcpServerId: string): Promise<Tool[]> {
    return db.select().from(tools).where(eq(tools.mcpServerId, mcpServerId));
  }

  /**
   * Get a specific tool
   */
  async getById(id: string): Promise<Tool | undefined> {
    const results = await db.select().from(tools).where(eq(tools.id, id));
    return results[0];
  }

  /**
   * Get a tool by name and MCP server ID
   */
  async getByNameAndServerId(name: string, mcpServerId: string): Promise<Tool | undefined> {
    const results = await db
      .select()
      .from(tools)
      .where(and(eq(tools.name, name), eq(tools.mcpServerId, mcpServerId)));
    return results[0];
  }

  /**
   * Create or update a tool
   */
  async upsert(tool: InsertTool): Promise<Tool> {
    const [result] = await db
      .insert(tools)
      .values(tool as any)
      .onConflictDoUpdate({
        target: tools.id,
        set: {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          isRead: tool.isRead,
          isWrite: tool.isWrite,
          idempotent: tool.idempotent,
          reversible: tool.reversible,
          updatedAt: new Date(),
        },
      })
      .returning();

    log.info(`Upserted tool ${tool.id} for MCP server ${tool.mcpServerId}`);
    return result;
  }

  /**
   * Update tool analysis results
   */
  async updateAnalysis(id: string, analysis: ToolAnalysisResult): Promise<Tool | undefined> {
    const [result] = await db
      .update(tools)
      .set({
        isRead: analysis.is_read,
        isWrite: analysis.is_write,
        idempotent: analysis.idempotent,
        reversible: analysis.reversible,
        updatedAt: new Date(),
      })
      .where(eq(tools.id, id))
      .returning();

    if (result) {
      log.info(`Updated analysis for tool ${id}`);
    }
    return result;
  }

  /**
   * Delete tools by MCP server ID
   */
  async deleteByMcpServerId(mcpServerId: string): Promise<void> {
    await db.delete(tools).where(eq(tools.mcpServerId, mcpServerId));
    log.info(`Deleted all tools for MCP server ${mcpServerId}`);
  }

  /**
   * Delete a specific tool
   */
  async delete(id: string): Promise<void> {
    await db.delete(tools).where(eq(tools.id, id));
    log.info(`Deleted tool ${id}`);
  }
}

export default new ToolModel();
