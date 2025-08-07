import { eq } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import db from '@backend/database';
import {
  McpServerConfigSchema,
  McpServerUserConfigValuesSchema,
  mcpServersTable,
} from '@backend/database/schema/mcpServer';
import ExternalMcpClientModel from '@backend/models/externalMcpClient';
import { getServerByName } from '@clients/archestra/catalog/gen';

export const UserConfigValuesSchema = McpServerUserConfigValuesSchema;
export const McpServerInsertSchema = createInsertSchema(mcpServersTable);
export const McpServerSelectSchema = createSelectSchema(mcpServersTable);

export type McpServer = z.infer<typeof McpServerSelectSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpServerUserConfigValues = z.infer<typeof McpServerUserConfigValuesSchema>;
type McpServerInsert = typeof mcpServersTable.$inferInsert;
type McpServerSelect = typeof mcpServersTable.$inferSelect;

export default class McpServerModel {
  static async create(data: McpServerInsert) {
    return db.insert(mcpServersTable).values(data).returning();
  }

  static async getAll() {
    return db.select().from(mcpServersTable);
  }

  static async getById(id: McpServerSelect['id']) {
    return db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id));
  }

  /**
   * Get installed MCP servers
   */
  static async getInstalledMcpServers() {
    return await this.getAll();
  }

  /**
   * Save MCP server from catalog
   */
  static async saveMcpServerFromCatalog(catalogName: string, userConfigValues?: McpServerInsert['userConfigValues']) {
    // Fetch the catalog entry using the generated client
    const { data, error } = await getServerByName({ path: { name: catalogName } });

    if (error) {
      throw new Error(`Failed to fetch catalog entry: ${error}`);
    }

    if (!data.config_for_archestra) {
      throw new Error(`MCP server ${catalogName} not found in catalog or missing Archestra config`);
    }

    /**
     * Check if already installed
     *
     * In this case 'name' represents the unique identifier of an mcp catalog entry
     */
    const existing = await db.select().from(mcpServersTable).where(eq(mcpServersTable.id, data.name));

    if (existing.length > 0) {
      throw new Error(`MCP server ${data.name} is already installed`);
    }

    const now = new Date();
    const [server] = await db
      .insert(mcpServersTable)
      .values({
        /**
         * The "name" field is the unique identifier for an MCP server in the catalog
         */
        id: data.name,
        name: data.display_name,
        serverConfig: data.server,
        userConfigValues: userConfigValues,
        createdAt: now.toISOString(),
      })
      .returning();

    // Sync all connected external MCP clients after installing
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();

    return server;
  }

  /**
   * Save custom MCP server
   *
   * There's no `userConfigValues` for custom servers as users can simply input those values
   * directly in the `serverConfig` that they provider
   */
  static async saveCustomMcpServer(name: string, serverConfig: McpServerInsert['serverConfig']) {
    const now = new Date();
    const [server] = await db
      .insert(mcpServersTable)
      .values({
        /**
         * Generate a UUID for custom servers to repesent the unique identifier
         */
        id: uuidv4(),
        name,
        serverConfig,
        createdAt: now.toISOString(),
      })
      .returning();

    // Sync all connected external MCP clients after installing
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();

    return server;
  }

  /**
   * Uninstall MCP server by id
   */
  static async uninstallMcpServer(id: McpServerSelect['id']) {
    await db.delete(mcpServersTable).where(eq(mcpServersTable.id, id));

    // Sync all connected external MCP clients after uninstalling
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();
  }
}
