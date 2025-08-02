import { mcpServersTable } from '@/backend/database/schema/mcpServer';

import PodmanRuntime from '@backend/mcpServerSandbox/podman/runtime';
import { MCPServer } from '@backend/models';

class MCPServerSandboxManager {
  private podmanRuntime: typeof PodmanRuntime;

  constructor() {
    this.podmanRuntime = PodmanRuntime;
  }

  private async startServer(mcpServer: typeof mcpServersTable.$inferSelect) {
    console.log(`Starting MCP server: ${mcpServer.name}`);
  }

  private async getInstalledMcpServers() {
    const mcpServers = await MCPServer.getAll();
    return mcpServers;
  }

  async startAllInstalledMcpServers() {
    await this.podmanRuntime.ensurePodmanIsInstalled();

    const mcpServers = await this.getInstalledMcpServers();
    for (const mcpServer of mcpServers) {
      await this.startServer(mcpServer);
    }
  }
}

export default new MCPServerSandboxManager();
