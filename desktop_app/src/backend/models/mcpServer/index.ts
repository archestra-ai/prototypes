import { eq } from 'drizzle-orm';

import db from '@backend/database';
import { mcpServersTable } from '@backend/database/schema/mcpServer';

export class MCPServer {
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
  static async saveMcpServerFromCatalog(connectorId: string) {
    /**
     * TODO: use archestra catalog codegen'd client to fetch the catalog entry
     */
    // const catalogEntry = CATALOG.find((entry) => entry.id === connectorId);

    if (!catalogEntry) {
      throw new Error(`MCP connector ${connectorId} not found in catalog`);
    }

    const now = new Date();
    const [server] = await db
      .insert(mcpServersTable)
      .values({
        name: catalogEntry.title,
        serverConfig: catalogEntry.server_config,
        createdAt: now.toISOString(),
      })
      .onConflictDoUpdate({
        target: mcpServersTable.name,
        set: {
          serverConfig: catalogEntry.server_config,
        },
      })
      .returning();

    // Sync all connected external MCP clients after installing
    const { ExternalMcpClient } = await import('@backend/models/externalMcpClient');
    await ExternalMcpClient.syncAllConnectedExternalMcpClients();

    return server;
  }

  /**
   * Uninstall MCP server
   */
  static async uninstallMcpServer(name: string) {
    await db.delete(mcpServersTable).where(eq(mcpServersTable.name, name));

    // Sync all connected external MCP clients after uninstalling
    const { ExternalMcpClient } = await import('@backend/models/externalMcpClient');
    await ExternalMcpClient.syncAllConnectedExternalMcpClients();
  }
}
