import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

import config from '@backend/config';
import db from '@backend/database';
import {
  ExternalMcpClientNameSchema,
  SelectExternalMcpClientSchema,
  externalMcpClientsTable,
} from '@backend/database/schema/externalMcpClient';
import McpServerModel from '@backend/models/mcpServer';

export default class ExternalMcpClient {
  static ARCHESTRA_MCP_SERVER_KEY = 'archestra.ai';
  static ARCHESTRA_SERVER_BASE_URL = `http://${config.server.http.host}:${config.server.http.port}`;
  static INSTALLED_MCP_SERVER_KEY_SUFFIX = '(archestra.ai)';

  /**
   * Get all connected external MCP clients
   */
  static async getConnectedExternalMcpClients() {
    return await db.select().from(externalMcpClientsTable).orderBy(externalMcpClientsTable.clientName);
  }

  /**
   * Save external MCP client to database
   */
  static async saveExternalMcpClient(clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']) {
    const now = new Date();

    await db.insert(externalMcpClientsTable).values({
      clientName,
      createdAt: now.toISOString(),
    });

    return await db
      .select()
      .from(externalMcpClientsTable)
      .where(eq(externalMcpClientsTable.clientName, clientName))
      .get();
  }

  /**
   * Delete external MCP client from database
   */
  static async deleteExternalMcpClient(clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']) {
    await db.delete(externalMcpClientsTable).where(eq(externalMcpClientsTable.clientName, clientName));
  }

  /**
   * Get config path for external MCP client
   */
  static getConfigPathForExternalMcpClient(
    clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']
  ): string {
    const homeDir =
      process.platform === 'win32'
        ? process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH
        : process.env.HOME;

    if (!homeDir) {
      throw new Error('Could not determine home directory');
    }

    switch (clientName) {
      case 'cursor':
        return path.join(homeDir, '.cursor', 'mcp.json');

      case 'claude':
        if (process.platform === 'darwin') {
          return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        } else if (process.platform === 'win32') {
          return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
        } else {
          return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
        }

      case 'vscode':
        return path.join(homeDir, '.vscode', 'mcp.json');

      default:
        throw new Error(`Unknown client: ${clientName}`);
    }
  }

  /**
   * Read config file
   */
  static async readConfigFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content.trim()) {
        return { mcpServers: {} };
      }
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { mcpServers: {} };
      }
      throw new Error(`Failed to read config file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Write config file
   */
  static async writeConfigFile(filePath: string, config: any): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  }

  /**
   * Update external MCP client config
   */
  static async updateExternalMcpClientConfig(clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']) {
    const configPath = this.getConfigPathForExternalMcpClient(clientName);
    const config = await this.readConfigFile(configPath);

    // Ensure mcpServers object exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add archestra.ai MCP server
    if (!config.mcpServers[this.ARCHESTRA_MCP_SERVER_KEY]) {
      config.mcpServers[this.ARCHESTRA_MCP_SERVER_KEY] = {
        url: `${this.ARCHESTRA_SERVER_BASE_URL}/mcp`,
      };
    }

    // Get installed MCP servers from mcpServer model
    const installedMcpServers = await McpServerModel.getInstalledMcpServers();

    // Add each installed MCP server with archestra.ai suffix
    for (const server of installedMcpServers) {
      const serverKey = `${server.name} ${this.INSTALLED_MCP_SERVER_KEY_SUFFIX}`;
      const serverConfig = {
        url: `${this.ARCHESTRA_SERVER_BASE_URL}/mcp_proxy/${server.name}`,
      };

      if (!config.mcpServers[serverKey]) {
        config.mcpServers[serverKey] = serverConfig;
      }
    }

    // Remove entries with (archestra.ai) suffix that aren't in installed servers
    const installedNames = new Set(installedMcpServers.map((s) => s.name));
    const keysToRemove: string[] = [];

    for (const key of Object.keys(config.mcpServers)) {
      if (key.endsWith(` ${this.INSTALLED_MCP_SERVER_KEY_SUFFIX}`)) {
        const serverName = key.slice(0, -this.INSTALLED_MCP_SERVER_KEY_SUFFIX.length - 1);
        if (!installedNames.has(serverName)) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      delete config.mcpServers[key];
    }

    await this.writeConfigFile(configPath, config);
  }

  /**
   * Connect external MCP client
   */
  static async connectExternalMcpClient(clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']) {
    // Update the client's config
    await this.updateExternalMcpClientConfig(clientName);

    // Save to database
    await this.saveExternalMcpClient(clientName);
  }

  /**
   * Disconnect external MCP client
   */
  static async disconnectExternalMcpClient(clientName: (typeof externalMcpClientsTable.$inferSelect)['clientName']) {
    const configPath = this.getConfigPathForExternalMcpClient(clientName);
    const config = await this.readConfigFile(configPath);

    if (config.mcpServers) {
      // Remove archestra.ai server
      delete config.mcpServers[this.ARCHESTRA_MCP_SERVER_KEY];

      // Remove all entries with (archestra.ai) suffix
      const keysToRemove = Object.keys(config.mcpServers).filter((key) =>
        key.endsWith(` ${this.INSTALLED_MCP_SERVER_KEY_SUFFIX}`)
      );

      for (const key of keysToRemove) {
        delete config.mcpServers[key];
      }
    }

    await this.writeConfigFile(configPath, config);

    // Delete from database
    await this.deleteExternalMcpClient(clientName);
  }

  /**
   * Sync all connected external MCP clients
   */
  static async syncAllConnectedExternalMcpClients() {
    const connectedClients = await this.getConnectedExternalMcpClients();
    for (const client of connectedClients) {
      await this.updateExternalMcpClientConfig(client.clientName);
    }
  }
}

export { ExternalMcpClientNameSchema, SelectExternalMcpClientSchema as ExternalMcpClientSchema };
