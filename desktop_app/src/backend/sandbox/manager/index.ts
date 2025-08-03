// import { mcpServersTable } from '@/backend/database/schema/mcpServer';
import getPort from 'get-port';

import PodmanRuntime from '@backend/sandbox/podman/runtime';
import SandboxedMCP from '@backend/sandbox/sandboxedMCP';

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
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerIdToSandboxedMCPMap: Map<number, SandboxedMCP> = new Map();

  onSandboxStartupSuccess: () => void = () => {};
  onSandboxStartupError: (error: Error) => void = () => {};

  constructor() {
    this.podmanRuntime = new PodmanRuntime(
      this.onPodmanMachineInstallationSuccess,
      this.onPodmanMachineInstallationError
    );
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

  private async onPodmanMachineInstallationSuccess() {
    console.log('Podman machine installation successful. Starting all installed MCP servers...');

    const mcpServers = await this.getInstalledMcpServers();

    // TODO: parallelize this and use Promise.allSettled to wait for all servers to start in parallel
    for (const mcpServer of mcpServers) {
      await this.startServer(mcpServer);
    }

    console.log('All MCP server containers started successfully');

    this.onSandboxStartupSuccess();
  }

  private onPodmanMachineInstallationError(error: Error) {
    console.log('Podman machine installation error', error, this.onSandboxStartupError);

    this.onSandboxStartupError(new Error(`There was an error starting up podman machine: ${error.message}`));
  }

  async startServer(mcpServer: InstalledMcpServer) {
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

  /**
   * Start the archestra podman machine and all installed MCP server containers
   */
  startAllInstalledMcpServers() {
    this.podmanRuntime.ensureArchestraMachineIsRunning();
  }

  /**
   * Stop the archestra podman machine (which will stop all installed MCP server containers)
   */
  turnOffSandbox() {
    this.podmanRuntime.stopArchestraMachine();
  }

  proxyRequestToMcpServerContainer(mcpServerId: number, request: any) {
    const sandboxedMCP = this.mcpServerIdToSandboxedMCPMap.get(mcpServerId);
    if (!sandboxedMCP) {
      throw new Error(`MCP server with id ${mcpServerId} not found`);
    }
    return sandboxedMCP.proxyRequestToContainer(request);
  }
}

export default new MCPServerSandboxManager();
