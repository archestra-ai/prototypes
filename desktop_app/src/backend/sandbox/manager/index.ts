import { McpServer } from '@archestra/types';
import { McpServerModel } from '@backend/models';
import PodmanContainer from '@backend/sandbox/podman/container';
import PodmanRuntime from '@backend/sandbox/podman/runtime';
import websocketService from '@backend/websocket';
import { setSocketPath } from '@clients/libpod/client';

class McpServerSandboxManager {
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerSlugToPodmanContainerMap: Map<string, PodmanContainer> = new Map();
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
      const { slug: serverSlug } = mcpServer;

      websocketService.broadcast({
        type: 'sandbox-mcp-server-starting',
        payload: { serverSlug },
      });

      try {
        await this.startServer(mcpServer);
        websocketService.broadcast({
          type: 'sandbox-mcp-server-started',
          payload: { serverSlug },
        });
      } catch (error) {
        websocketService.broadcast({
          type: 'sandbox-mcp-server-failed',
          payload: {
            serverSlug,
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

  async startServer({ slug, name, serverConfig }: McpServer) {
    console.log(`Starting MCP server ${name} (slug: ${slug}) with server config: ${JSON.stringify(serverConfig)}`);

    const container = new PodmanContainer(slug, serverConfig);
    await container.startOrCreateContainer();

    this.mcpServerSlugToPodmanContainerMap.set(slug, container);
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

  proxyRequestToMcpServerContainer(mcpServerSlug: string, request: any) {
    const podmanContainer = this.mcpServerSlugToPodmanContainerMap.get(mcpServerSlug);
    if (!podmanContainer) {
      throw new Error(`MCP server with slug ${mcpServerSlug} not found`);
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
