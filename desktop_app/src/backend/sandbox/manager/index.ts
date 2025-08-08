import McpServerModel, { type McpServer } from '@backend/models/mcpServer';
import PodmanContainer from '@backend/sandbox/podman/container';
import PodmanRuntime from '@backend/sandbox/podman/runtime';
import websocketService from '@backend/websocket';
import { setSocketPath } from '@clients/libpod/client';

class McpServerSandboxManager {
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerIdToPodmanContainerMap: Map<string, PodmanContainer> = new Map();
  private _isInitialized = false;

  onSandboxStartupSuccess: () => void = () => {};
  onSandboxStartupError: (error: Error) => void = () => {};

  constructor() {
    this.podmanRuntime = new PodmanRuntime(
      this.onPodmanMachineInstallationSuccess.bind(this),
      this.onPodmanMachineInstallationError.bind(this)
    );
  }

  private async onPodmanMachineInstallationSuccess() {
    console.log('Podman machine installation successful. Starting all installed MCP servers...');

    try {
      // Get the actual socket path from the running podman machine
      console.log('Getting podman socket address...');
      const socketPath = await this.podmanRuntime.getSocketAddress();
      console.log('Got podman socket address:', socketPath);

      // Configure the libpod client to use this socket
      setSocketPath(socketPath);
      console.log('Socket path has been updated in libpod client');

      // Now pull the base image with the correct socket configured
      console.log('Pulling base image...');
      await this.podmanRuntime.pullBaseImageOnMachineInstallationSuccess();
      console.log('Base image pulled successfully');
    } catch (error) {
      console.error('Failed during podman setup:', error);
      this.onPodmanMachineInstallationError(error as Error);
      return;
    }

    this._isInitialized = true;

    websocketService.broadcast({
      type: 'sandbox-startup-completed',
      payload: {},
    });

    const installedMcpServers = await McpServerModel.getAll();

    // Start all servers in parallel
    const startPromises = installedMcpServers.map(async (mcpServer) => {
      const { id: serverId } = mcpServer;

      websocketService.broadcast({
        type: 'sandbox-mcp-server-starting',
        payload: { serverId },
      });

      try {
        await this.startServer(mcpServer);
        websocketService.broadcast({
          type: 'sandbox-mcp-server-started',
          payload: { serverId },
        });
      } catch (error) {
        websocketService.broadcast({
          type: 'sandbox-mcp-server-failed',
          payload: {
            serverId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    });

    const results = await Promise.allSettled(startPromises);

    // Check for failures
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(`Failed to start ${failures.length} MCP server(s):`);
      failures.forEach((failure, index) => {
        console.error(`  - ${(failure as PromiseRejectedResult).reason}`);
      });
      this.onSandboxStartupError(new Error(`Failed to start ${failures.length} MCP server(s)`));
      return;
    }

    console.log('All MCP server containers started successfully');
    this.onSandboxStartupSuccess();
  }

  private onPodmanMachineInstallationError(error: Error) {
    const errorMessage = `There was an error starting up podman machine: ${error.message}`;

    this._isInitialized = false;

    websocketService.broadcast({
      type: 'sandbox-startup-failed',
      payload: {
        error: errorMessage,
      },
    });

    this.onSandboxStartupError(new Error(errorMessage));
  }

  async startServer(mcpServer: McpServer) {
    const { id, name, serverConfig } = mcpServer;
    const container = new PodmanContainer(mcpServer);
    await container.startOrCreateContainer();
    this.mcpServerIdToPodmanContainerMap.set(id, container);
  }

  async stopServer(mcpServerId: string) {
    const container = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);

    if (container) {
      await container.stopContainer();
      this.mcpServerIdToPodmanContainerMap.delete(mcpServerId);
    }
  }

  /**
   * Start the archestra podman machine and all installed MCP server containers
   */
  startAllInstalledMcpServers() {
    websocketService.broadcast({
      type: 'sandbox-startup-started',
      payload: {},
    });
    this.podmanRuntime.ensureArchestraMachineIsRunning();
  }

  /**
   * Stop the archestra podman machine (which will stop all installed MCP server containers)
   */
  turnOffSandbox() {
    this.podmanRuntime.stopArchestraMachine();
    this._isInitialized = false;
  }

  proxyRequestToMcpServerContainer(mcpServerId: string, request: any) {
    const podmanContainer = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);
    if (!podmanContainer) {
      throw new Error(`MCP server with id ${mcpServerId} not found`);
    }
    return podmanContainer.proxyRequestToContainer(request);
  }

  getSandboxStatus() {
    return {
      isInitialized: this._isInitialized,
      podmanMachineStatus: this.podmanRuntime.machineStatus,
      // mcpServersStatus: Record<number, object> - TODO: implement later
    };
  }
}

export default new McpServerSandboxManager();
