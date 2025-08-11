import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import db from '@backend/database';
import {
  McpServer,
  McpServerConfigSchema,
  McpServerSchema,
  McpServerUserConfigValuesSchema,
  mcpServersTable,
} from '@backend/database/schema/mcpServer';
import ExternalMcpClientModel from '@backend/models/externalMcpClient';
import McpServerSandboxManager from '@backend/sandbox';
import log from '@backend/utils/logger';

export const McpServerContainerLogsSchema = z.object({
  logs: z.string(),
  containerName: z.string(),
  logFilePath: z.string(),
});

export const McpServerInstallSchema = z.object({
  id: z.string().optional(),
  displayName: z.string(),
  serverConfig: McpServerConfigSchema,
  userConfigValues: McpServerUserConfigValuesSchema.optional(),
});

export type McpServerContainerLogs = z.infer<typeof McpServerContainerLogsSchema>;

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

  static async startServerAndSyncAllConnectedExternalMcpClients(mcpServer: McpServer) {
    await McpServerSandboxManager.startServer(mcpServer);
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();
  }

  /**
   * Get installed MCP servers
   */
  static async getInstalledMcpServers() {
    return await this.getAll();
  }

  /**
   * Install an MCP server. Either from the catalog, or a customer server
   *
   * id here is "polymorphic"
   *
   * For mcp servers installed from the catalog, it will represent the "name" (unique identifier)
   * of an entry in the catalog. Example:
   *
   * modelcontextprotocol__servers__src__everything
   *
   * Otherwise, if this is not specified, it infers that this is a "custom" MCP server, and
   * a UUID will be generated for it
   *
   * Additionally, for custom MCP servers, there's no `userConfigValues` as users can simply input those values
   * directly in the `serverConfig` that they provider
   */
  static async installMcpServer({
    id,
    displayName,
    serverConfig,
    userConfigValues,
  }: z.infer<typeof McpServerInstallSchema>) {
    /**
     * Check if an mcp server with this id already exists
     */
    if (!id) {
      id = uuidv4();
      log.info(`no id provided (custom mcp server installation), generating a new one: ${id}`);
    } else {
      log.info(`id provided (mcp server installation from catalog), using the provided one: ${id}`);
    }

    const existing = await db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id));

    if (existing.length > 0) {
      throw new Error(`MCP server ${id} is already installed`);
    }

    const now = new Date();
    const [server] = await db
      .insert(mcpServersTable)
      .values({
        id,
        name: displayName,
        serverConfig,
        userConfigValues: userConfigValues,
        createdAt: now.toISOString(),
      })
      .returning();

    await this.startServerAndSyncAllConnectedExternalMcpClients(server);

    return server;
  }

  /**
   * Uninstall MCP server by id
   */
  static async uninstallMcpServer(id: (typeof mcpServersTable.$inferSelect)['id']) {
    await db.delete(mcpServersTable).where(eq(mcpServersTable.id, id));

    // Stop the server in the sandbox
    await McpServerSandboxManager.stopServer(id);

    // Sync all connected external MCP clients after uninstalling
    await ExternalMcpClientModel.syncAllConnectedExternalMcpClients();
  }
}

export {
  type McpServer,
  type McpServerConfig,
  type McpServerUserConfigValues,
} from '@backend/database/schema/mcpServer';
export { McpServerSchema };
