import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import db from '@backend/database';
import { mcpServersTable } from '@backend/database/schema/mcpServer';
import ExternalMcpClientModel from '@backend/models/externalMcpClient';
import { getMcpServer } from '@clients/archestra/catalog/gen';

export default class McpServerModel {
  static async create(data: typeof mcpServersTable.$inferInsert) {
    return db.insert(mcpServersTable).values(data).returning();
  }

  static async getAll() {
    return db.select().from(mcpServersTable);
  }

  static async getById(id: (typeof mcpServersTable.$inferSelect)['id']) {
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
  static async saveMcpServerFromCatalog(
    catalogName: string,
    userConfigValues?: (typeof mcpServersTable.$inferSelect)['userConfigValues']
  ) {
    // Fetch the catalog entry using the generated client
    const { data, error } = await getMcpServer({ path: { name: catalogName } });

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
        serverConfig: data.server.mcp_config,
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
  static async saveCustomMcpServer(name: string, serverConfig: (typeof mcpServersTable.$inferSelect)['serverConfig']) {
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
  static async uninstallMcpServer(id: (typeof mcpServersTable.$inferSelect)['id']) {
    await db.delete(mcpServersTable).where(eq(mcpServersTable.id, id));

    // Sync all connected external MCP clients after uninstalling
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();
  }
}

export {
  McpServerConfigSchema,
  McpServerSchema,
  McpServerUserConfigValuesSchema,
  type McpServer,
  type McpServerConfig,
  type McpServerUserConfigValues,
} from '@backend/database/schema/mcpServer';
