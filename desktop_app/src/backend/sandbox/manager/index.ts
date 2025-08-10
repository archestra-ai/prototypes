import type { RawReplyDefaultExpression } from 'fastify';
import { z } from 'zod';

import { setSocketPath } from '@backend/clients/libpod/client';
import McpServerModel, { type McpServer, type McpServerContainerLogs } from '@backend/models/mcpServer';
import PodmanContainer, { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import PodmanRuntime, { PodmanRuntimeStatusSummarySchema } from '@backend/sandbox/podman/runtime';

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

  private _status: SandboxStatus = 'not_installed';

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

    this._status = 'running';

    const installedMcpServers = await McpServerModel.getAll();

    // Start all servers in parallel
    const startPromises = installedMcpServers.map(async (mcpServer) => {
      const { id: serverId } = mcpServer;

      try {
        await this.startServer(mcpServer);
      } catch (error) {
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
    this._status = 'error';
    this.onSandboxStartupError(new Error(errorMessage));
  }

  async startServer(mcpServer: McpServer) {
    const { id, name, serverConfig } = mcpServer;
    console.log(`🚀 Starting MCP server: id="${id}", name="${name}"`);

    const container = new PodmanContainer(mcpServer);
    await container.startOrCreateContainer();

    this.mcpServerIdToPodmanContainerMap.set(id, container);
    console.log(`✅ Registered container for MCP server ${id} in map`);
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
    this._status = 'initializing';
    this.podmanRuntime.ensureArchestraMachineIsRunning();
  }

  /**
   * Stop the archestra podman machine (which will stop all installed MCP server containers)
   */
  turnOffSandbox() {
    this._status = 'stopping';
    this.podmanRuntime.stopArchestraMachine();
    this._status = 'stopped';
  }

  checkContainerExists(mcpServerId: string): boolean {
    console.log(`🔍 Checking if container exists for MCP server ${mcpServerId}...`);
    console.log(`📋 Available MCP servers:`, Array.from(this.mcpServerIdToPodmanContainerMap.keys()));
    console.log(`📊 Total containers in map: ${this.mcpServerIdToPodmanContainerMap.size}`);

    const exists = this.mcpServerIdToPodmanContainerMap.has(mcpServerId);
    console.log(`Container ${mcpServerId} exists: ${exists}`);
    return exists;
  }

  async streamToMcpServerContainer(
    mcpServerId: string,
    request: any,
    responseStream: RawReplyDefaultExpression
  ): Promise<void> {
    console.log(`🔍 Looking for MCP server ${mcpServerId} in map...`);
    console.log(`📋 Available MCP servers:`, Array.from(this.mcpServerIdToPodmanContainerMap.keys()));

    const podmanContainer = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);
    if (!podmanContainer) {
      // This should not happen if checkContainerExists was called first
      throw new Error(`MCP server ${mcpServerId} container not found`);
    }

    console.log(`✅ Found container for ${mcpServerId}, streaming request...`);
    await podmanContainer.streamToContainer(request, responseStream);
  }

  /**
   * 📖 Get logs for a specific MCP server container
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
      status: this._status,
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
