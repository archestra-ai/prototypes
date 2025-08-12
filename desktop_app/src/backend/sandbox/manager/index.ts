import type { RawReplyDefaultExpression } from 'fastify';
import { z } from 'zod';

import { setSocketPath } from '@backend/clients/libpod/client';
import McpServerModel, { type McpServer, type McpServerContainerLogs } from '@backend/models/mcpServer';
import PodmanContainer, { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import PodmanRuntime, { PodmanRuntimeStatusSummarySchema } from '@backend/sandbox/podman/runtime';
import log from '@backend/utils/logger';
import websocketService from '@backend/websocket';

export const SandboxStatusSchema = z.enum(['not_installed', 'initializing', 'running', 'error', 'stopping', 'stopped']);

export const SandboxStatusSummarySchema = z.object({
  status: SandboxStatusSchema,
  runtime: PodmanRuntimeStatusSummarySchema,
  containers: z.record(z.string().describe('The MCP server ID'), PodmanContainerStatusSummarySchema),
});

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(SandboxStatusSummarySchema, { id: 'SandboxStatusSummary' });
z.globalRegistry.add(PodmanContainerStatusSummarySchema, { id: 'PodmanContainerStatusSummary' });

type SandboxStatus = z.infer<typeof SandboxStatusSchema>;
export type SandboxStatusSummary = z.infer<typeof SandboxStatusSummarySchema>;

class McpServerSandboxManager {
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerIdToPodmanContainerMap: Map<string, PodmanContainer> = new Map();

  private status: SandboxStatus = 'not_installed';

  private socketPath: string | null = null;

  onSandboxStartupSuccess: () => void = () => {};
  onSandboxStartupError: (error: Error) => void = () => {};

  constructor() {
    this.podmanRuntime = new PodmanRuntime(
      this.onPodmanMachineInstallationSuccess.bind(this),
      this.onPodmanMachineInstallationError.bind(this)
    );
  }

  private async onPodmanMachineInstallationSuccess() {
    log.info('Podman machine installation successful. Starting all installed MCP servers...');

    try {
      // Get the actual socket path from the running podman machine
      log.info('Getting podman socket address...');
      const socketPath = await this.podmanRuntime.getSocketAddress();
      log.info('Got podman socket address:', socketPath);

      // Store the socket path for later use
      this.socketPath = socketPath;

      // Configure the libpod client to use this socket
      setSocketPath(socketPath);
      log.info('Socket path has been updated in libpod client');

      // Broadcast base image fetch started
      websocketService.broadcast({
        type: 'sandbox-base-image-fetch-started',
        payload: {
          message: 'Starting to pull MCP server base image',
        },
      });

      // Now pull the base image with the correct socket configured
      log.info('Pulling base image...');

      // Create an interval to broadcast base image pull progress
      const progressInterval = setInterval(() => {
        const imageStatus = this.podmanRuntime.statusSummary.baseImage;
        if (imageStatus.pullPercentage > 0 && imageStatus.pullPercentage < 100) {
          websocketService.broadcast({
            type: 'sandbox-base-image-fetch-progress',
            payload: {
              message: imageStatus.pullMessage || 'Pulling base image...',
              progress: imageStatus.pullPercentage,
            },
          });
        }
      }, 500); // Update every 500ms

      try {
        await this.podmanRuntime.pullBaseImageOnMachineInstallationSuccess();
        clearInterval(progressInterval);

        websocketService.broadcast({
          type: 'sandbox-base-image-fetch-completed',
          payload: {
            message: 'Base image pulled successfully',
            progress: 100,
          },
        });
        log.info('Base image pulled successfully');
      } catch (error) {
        clearInterval(progressInterval);

        websocketService.broadcast({
          type: 'sandbox-base-image-fetch-failed',
          payload: {
            message: 'Failed to pull base image',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
    } catch (error) {
      log.error('Failed during podman setup:', error);
      this.onPodmanMachineInstallationError(error as Error);
      return;
    }

    this.status = 'running';

    const installedMcpServers = await McpServerModel.getAll();

    // Start all servers in parallel
    const startPromises = installedMcpServers.map(async (mcpServer) => {
      const { id: serverId, name: serverName } = mcpServer;

      try {
        websocketService.broadcast({
          type: 'sandbox-mcp-server-starting',
          payload: {
            serverId,
            serverName,
            message: `Starting MCP server: ${serverName}`,
          },
        });

        await this.startServer(mcpServer);

        websocketService.broadcast({
          type: 'sandbox-mcp-server-started',
          payload: {
            serverId,
            serverName,
            message: `MCP server ${serverName} started successfully`,
            progress: 100,
          },
        });
      } catch (error) {
        websocketService.broadcast({
          type: 'sandbox-mcp-server-failed',
          payload: {
            serverId,
            serverName,
            message: `Failed to start MCP server ${serverName}`,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
    });

    const results = await Promise.allSettled(startPromises);

    // Check for failures
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      log.error(`Failed to start ${failures.length} MCP server(s):`);
      failures.forEach((failure, index) => {
        log.error(`  - ${(failure as PromiseRejectedResult).reason}`);
      });
      this.onSandboxStartupError(new Error(`Failed to start ${failures.length} MCP server(s)`));
      return;
    }

    log.info('All MCP server containers started successfully');
    this.onSandboxStartupSuccess();
  }

  private onPodmanMachineInstallationError(error: Error) {
    const errorMessage = `There was an error starting up podman machine: ${error.message}`;
    this.status = 'error';
    this.onSandboxStartupError(new Error(errorMessage));
  }

  async startServer(mcpServer: McpServer) {
    const { id, name } = mcpServer;
    log.info(`Starting MCP server: id="${id}", name="${name}"`);

    const container = new PodmanContainer(mcpServer, this.socketPath);
    await container.startOrCreateContainer();

    this.mcpServerIdToPodmanContainerMap.set(id, container);
    log.info(`Registered container for MCP server ${id} in map`);
  }

  async stopServer(mcpServerId: string) {
    const container = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);

    if (container) {
      await container.stopContainer();
      this.mcpServerIdToPodmanContainerMap.delete(mcpServerId);
    }
  }

  /**
   * Responsible for doing the following:
   * - Starting the archestra podman machine
   * - Pulling the base image required to run MCP servers as containers
   * - Starting all installed MCP server containers
   */
  start() {
    this.status = 'initializing';

    websocketService.broadcast({
      type: 'sandbox-startup-started',
      payload: {
        message: 'Starting sandbox initialization',
      },
    });

    // Create an interval to broadcast runtime progress
    const runtimeProgressInterval = setInterval(() => {
      const runtimeStatus = this.podmanRuntime.statusSummary;
      if (runtimeStatus.startupPercentage > 0 && runtimeStatus.startupPercentage < 100) {
        websocketService.broadcast({
          type: 'sandbox-podman-runtime-progress',
          payload: {
            message: runtimeStatus.startupMessage || 'Initializing Podman runtime...',
            progress: runtimeStatus.startupPercentage,
          },
        });
      }
    }, 500); // Update every 500ms

    // Store the interval so we can clear it later
    this.onSandboxStartupSuccess = () => {
      clearInterval(runtimeProgressInterval);
      websocketService.broadcast({
        type: 'sandbox-startup-completed',
        payload: {
          message: 'Sandbox initialization completed successfully',
          progress: 100,
        },
      });
    };

    this.onSandboxStartupError = (error: Error) => {
      clearInterval(runtimeProgressInterval);
      websocketService.broadcast({
        type: 'sandbox-startup-failed',
        payload: {
          message: 'Sandbox initialization failed',
          error: error.message,
        },
      });
    };

    this.podmanRuntime.ensureArchestraMachineIsRunning();
  }

  /**
   * Stop the archestra podman machine (which will stop all installed MCP server containers)
   */
  turnOffSandbox() {
    this.status = 'stopping';
    this.podmanRuntime.stopArchestraMachine();
    this.status = 'stopped';
  }

  checkContainerExists(mcpServerId: string): boolean {
    log.info(`Checking if container exists for MCP server ${mcpServerId}...`);
    log.info(`Available MCP servers:`, Array.from(this.mcpServerIdToPodmanContainerMap.keys()));
    log.info(`Total containers in map: ${this.mcpServerIdToPodmanContainerMap.size}`);

    const exists = this.mcpServerIdToPodmanContainerMap.has(mcpServerId);
    log.info(`Container ${mcpServerId} exists: ${exists}`);
    return exists;
  }

  async streamToMcpServerContainer(
    mcpServerId: string,
    request: any,
    responseStream: RawReplyDefaultExpression
  ): Promise<void> {
    log.info(`Looking for MCP server ${mcpServerId} in map...`);
    log.info(`Available MCP servers:`, Array.from(this.mcpServerIdToPodmanContainerMap.keys()));

    const podmanContainer = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);
    if (!podmanContainer) {
      // This should not happen if checkContainerExists was called first
      throw new Error(`MCP server ${mcpServerId} container not found`);
    }

    log.info(`Found container for ${mcpServerId}, streaming request...`);
    await podmanContainer.streamToContainer(request, responseStream);
  }

  /**
   * Get logs for a specific MCP server container
   */
  async getMcpServerLogs(mcpServerId: string, lines: number = 100): Promise<McpServerContainerLogs> {
    const podmanContainer = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);
    if (!podmanContainer) {
      throw new Error(`MCP server ${mcpServerId} container not found`);
    }
    return {
      logs: await podmanContainer.getRecentLogs(lines),
      containerName: podmanContainer.containerName,
      logFilePath: podmanContainer.logFilePath,
    };
  }

  get statusSummary(): SandboxStatusSummary {
    return {
      status: this.status,
      runtime: this.podmanRuntime.statusSummary,
      containers: Object.fromEntries(
        Array.from(this.mcpServerIdToPodmanContainerMap.entries()).map(([mcpServerId, podmanContainer]) => [
          mcpServerId,
          podmanContainer.statusSummary,
        ])
      ),
    };
  }
}

export default new McpServerSandboxManager();
