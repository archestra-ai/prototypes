import { z } from 'zod';

import { setSocketPath } from '@backend/clients/libpod/client';
import McpServerModel, { type McpServer } from '@backend/models/mcpServer';
import { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import PodmanRuntime, { PodmanRuntimeStatusSummarySchema } from '@backend/sandbox/podman/runtime';
import SandboxedMcpServer, {
  type AvailableTool,
  type McpTools,
  SandboxedMcpServerStatusSummarySchema,
} from '@backend/sandbox/sandboxedMcp';
import log from '@backend/utils/logger';

export const SandboxStatusSchema = z.enum(['not_installed', 'initializing', 'running', 'error', 'stopping', 'stopped']);

export const SandboxStatusSummarySchema = z.object({
  status: SandboxStatusSchema,
  runtime: PodmanRuntimeStatusSummarySchema,
  mcpServers: z.record(z.string().describe('The MCP server ID'), SandboxedMcpServerStatusSummarySchema),
});

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(SandboxStatusSummarySchema, { id: 'SandboxStatusSummary' });
z.globalRegistry.add(PodmanContainerStatusSummarySchema, { id: 'PodmanContainerStatusSummary' });

type SandboxStatus = z.infer<typeof SandboxStatusSchema>;
export type SandboxStatusSummary = z.infer<typeof SandboxStatusSummarySchema>;

/**
 * McpServerSandboxManager is a singleton "manager" responsible for.. managing
 * the installation/status of sandboxed MCP servers running in Podman
 */
class McpServerSandboxManager {
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerIdToSandboxedMcpServerMap: Map<string, SandboxedMcpServer> = new Map();

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

      // Now pull the base image with the correct socket configured
      log.info('Pulling base image...');
      await this.podmanRuntime.pullBaseImageOnMachineInstallationSuccess(socketPath);
      log.info('Base image pulled successfully');
    } catch (error) {
      log.error('Failed during podman setup:', error);
      this.onPodmanMachineInstallationError(error as Error);
      return;
    }

    this.status = 'running';

    const installedMcpServers = await McpServerModel.getAll();

    // Start all servers in parallel
    const startPromises = installedMcpServers.map(async (mcpServer) => {
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

    if (!this.socketPath) {
      throw new Error('Socket path is not initialized');
    }

    const sandboxedMcpServer = new SandboxedMcpServer(mcpServer, this.socketPath);
    await sandboxedMcpServer.start();

    this.mcpServerIdToSandboxedMcpServerMap.set(id, sandboxedMcpServer);
    log.info(`Registered sandboxed MCP server ${id} in map`);
  }

  async stopServer(mcpServerId: string) {
    const sandboxedMcpServer = this.mcpServerIdToSandboxedMcpServerMap.get(mcpServerId);

    if (sandboxedMcpServer) {
      await sandboxedMcpServer.stop();
      this.mcpServerIdToSandboxedMcpServerMap.delete(mcpServerId);
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

  getSandboxedMcpServer(mcpServerId: string): SandboxedMcpServer | undefined {
    return this.mcpServerIdToSandboxedMcpServerMap.get(mcpServerId);
  }

  async removeMcpServer(mcpServerId: string) {
    log.info(`Removing mcp server for MCP server: ${mcpServerId}`);

    const sandboxedMcpServer = this.mcpServerIdToSandboxedMcpServerMap.get(mcpServerId);
    if (!sandboxedMcpServer) {
      log.warn(`No container found for MCP server ${mcpServerId}`);
      return;
    }

    try {
      await sandboxedMcpServer.stop();
      log.info(`Successfully removed MCP server ${mcpServerId}`);
    } catch (error) {
      log.error(`Failed to remove MCP server ${mcpServerId}:`, error);
      throw error;
    } finally {
      this.mcpServerIdToSandboxedMcpServerMap.delete(mcpServerId);
    }
  }

  /**
   * Get all tools, for all running MCP servers, in the Vercel AI SDK's format
   */
  getAllTools(): McpTools {
    const allTools: McpTools = {};

    for (const sandboxedMcpServer of this.mcpServerIdToSandboxedMcpServerMap.values()) {
      for (const [toolName, tool] of Object.entries(sandboxedMcpServer.tools)) {
        allTools[toolName] = tool;
      }
    }

    return allTools;
  }

  /**
   * Get specific tools, by ID, in the Vercel AI SDK's format
   */
  getToolsById(toolIds: string[]): McpTools {
    const allTools = this.getAllTools();
    const selected: McpTools = {};

    for (const toolId of toolIds) {
      if (allTools[toolId]) {
        selected[toolId] = allTools[toolId];
      }
    }

    return selected;
  }

  /**
   * Get all available tools, for all running MCP servers, in a slightly transformed format
   * that we expose to the UI
   */
  get allAvailableTools(): AvailableTool[] {
    return Array.from(this.mcpServerIdToSandboxedMcpServerMap.values()).flatMap(
      (sandboxedMcpServer) => sandboxedMcpServer.availableToolsList
    );
  }

  get statusSummary(): SandboxStatusSummary {
    return {
      status: this.status,
      runtime: this.podmanRuntime.statusSummary,
      mcpServers: Object.fromEntries(
        Array.from(this.mcpServerIdToSandboxedMcpServerMap.entries()).map(([mcpServerId, podmanContainer]) => [
          mcpServerId,
          podmanContainer.statusSummary,
        ])
      ),
    };
  }
}

export default new McpServerSandboxManager();
