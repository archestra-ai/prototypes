// import { mcpServersTable } from '@/backend/database/schema/mcpServer';
import getPort from 'get-port';

import PodmanRuntime from '@backend/mcpServerSandbox/podman/runtime';

import SandboxedMCP from './sandboxedMCP';

// TODO: this should use the MCPServer model schema once we agree w/ Matvey what the catalog schema will look like
type InstalledMcpServer = {
  id: number;
  name: string;
  dockerImage: string;
  envVars: Record<string, string>;
  // TODO: where will we get the container port from?
  containerPort: number;
};

class MCPServerSandboxManager {
  private podmanRuntime: typeof PodmanRuntime;
  private mcpServerIdToSandboxedMCPMap: Map<number, SandboxedMCP> = new Map();

  constructor() {
    this.podmanRuntime = PodmanRuntime;
  }

  private async startServer(mcpServer: InstalledMcpServer) {
    const mcpServerContainerHostPort = await getPort();
    const sandboxedMCP = new SandboxedMCP(
      mcpServer.dockerImage,
      mcpServer.containerPort,
      mcpServerContainerHostPort,
      mcpServer.envVars
    );

    this.mcpServerIdToSandboxedMCPMap.set(mcpServer.id, sandboxedMCP);
    await sandboxedMCP.start();
  }

  private async getInstalledMcpServers(): Promise<InstalledMcpServer[]> {
    // TODO: uncomment this out once we agree w/ Matvey what the catalog schema will look like
    // const mcpServers = await MCPServer.getAll();
    return [
      {
        id: 1,
        name: 'Grafana',
        dockerImage: 'mcp/grafana',
        // TODO: where will we get the container port from?
        containerPort: 8000,
        envVars: {
          GRAFANA_URL: 'http://localhost:3000',
          GRAFANA_API_KEY: '1234567890',
        },
      },
      {
        id: 2,
        name: 'GitHub',
        dockerImage: 'ghcr.io/github/github-mcp-server',
        /**
         * TODO: this isn't right.. this is just a placeholder for now
         * https://github.com/github/github-mcp-server/tree/main?tab=readme-ov-file#installation
         */
        containerPort: 8001,
        envVars: {
          GITHUB_PERSONAL_ACCESS_TOKEN: '1234567890',
        },
      },
    ];
  }

  async startAllInstalledMcpServers() {
    await this.podmanRuntime.ensurePodmanIsInstalled();

    const mcpServers = await this.getInstalledMcpServers();
    for (const mcpServer of mcpServers) {
      await this.startServer(mcpServer);
    }
  }

  async stopAllInstalledMcpServers() {
    await this.podmanRuntime.stopPodmanMachine();
  }
}

export default new MCPServerSandboxManager();
