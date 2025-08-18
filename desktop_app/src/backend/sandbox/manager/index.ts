import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type experimental_MCPClient, experimental_createMCPClient } from 'ai';
import type { RawReplyDefaultExpression } from 'fastify';
import { z } from 'zod';

import { setSocketPath } from '@backend/clients/libpod/client';
import config from '@backend/config';
import McpServerModel, { type McpServer } from '@backend/models/mcpServer';
import PodmanContainer, { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import PodmanRuntime, { PodmanRuntimeStatusSummarySchema } from '@backend/sandbox/podman/runtime';
import log from '@backend/utils/logger';

// Type for MCP tools returned by the client
type McpTools = Awaited<ReturnType<experimental_MCPClient['tools']>>;

export const SandboxStatusSchema = z.enum(['not_installed', 'initializing', 'running', 'error', 'stopping', 'stopped']);

export const SandboxStatusSummarySchema = z.object({
  status: SandboxStatusSchema,
  runtime: PodmanRuntimeStatusSummarySchema,
  containers: z.record(z.string().describe('The MCP server ID'), PodmanContainerStatusSummarySchema),
});

export const McpServerContainerLogsSchema = z.object({
  logs: z.string(),
  containerName: z.string(),
});

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(SandboxStatusSummarySchema, { id: 'SandboxStatusSummary' });
z.globalRegistry.add(PodmanContainerStatusSummarySchema, { id: 'PodmanContainerStatusSummary' });

type SandboxStatus = z.infer<typeof SandboxStatusSchema>;
export type SandboxStatusSummary = z.infer<typeof SandboxStatusSummarySchema>;
type McpServerContainerLogs = z.infer<typeof McpServerContainerLogsSchema>;

class McpServerSandboxManager {
  private podmanRuntime: InstanceType<typeof PodmanRuntime>;
  private mcpServerIdToPodmanContainerMap: Map<string, PodmanContainer> = new Map();
  private mcpClients: Map<string, experimental_MCPClient> = new Map();
  private availableTools: Map<string, McpTools> = new Map();

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

    const container = new PodmanContainer(mcpServer, this.socketPath);
    await container.startOrCreateContainer();

    this.mcpServerIdToPodmanContainerMap.set(id, container);
    log.info(`Registered container for MCP server ${id} in map`);

    // Connect MCP client after container is ready
    await this.connectMcpClient(id);
  }

  private async connectMcpClient(serverId: string) {
    try {
      // Wait a bit for container to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const { host, port } = config.server.http;
      const url = `http://${host}:${port}/mcp_proxy/${serverId}`;
      log.info(`Attempting to connect MCP client to ${url}`);

      // First check if the server is reachable
      try {
        const testResponse = await fetch(`http://${host}:${port}/api/mcp_server/sandbox_status`);
        log.info(`Server health check response status: ${testResponse.status}`);
      } catch (testError) {
        log.error(`Server is not reachable at http://${host}:${port}:`, testError);
        // Don't proceed if server is not reachable
        return;
      }

      const transport = new StreamableHTTPClientTransport(new URL(url));
      const client = await experimental_createMCPClient({ transport: transport as any });
      this.mcpClients.set(serverId, client);

      // Fetch and cache tools directly from the client
      const clientTools = await client.tools();
      this.availableTools.set(serverId, clientTools);

      log.info(`Connected MCP client for ${serverId}, found ${Object.keys(clientTools).length} tools`);
    } catch (error) {
      log.error(`Failed to connect MCP client for ${serverId}:`, error);
    }
  }

  async stopServer(mcpServerId: string) {
    const container = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);

    if (container) {
      await container.stopContainer();
      this.mcpServerIdToPodmanContainerMap.delete(mcpServerId);
    }

    // Clean up MCP client
    const client = this.mcpClients.get(mcpServerId);
    if (client) {
      await client.close();
      this.mcpClients.delete(mcpServerId);
      this.availableTools.delete(mcpServerId);
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

  checkContainerExists(mcpServerId: string): boolean {
    log.info(`Checking if container exists for MCP server ${mcpServerId}...`);
    log.info(`Available MCP servers: ${Array.from(this.mcpServerIdToPodmanContainerMap.keys())}`);
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
    log.info(`Available MCP servers: ${Array.from(this.mcpServerIdToPodmanContainerMap.keys())}`);

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
    };
  }

  /**
   * Remove a container and clean up its resources
   */
  async removeContainer(mcpServerId: string) {
    log.info(`Removing container for MCP server: ${mcpServerId}`);

    const container = this.mcpServerIdToPodmanContainerMap.get(mcpServerId);
    if (!container) {
      log.warn(`No container found for MCP server ${mcpServerId}`);
      return;
    }

    try {
      await container.removeContainer();
      this.mcpServerIdToPodmanContainerMap.delete(mcpServerId);

      log.info(`Successfully removed container and cleaned up resources for MCP server ${mcpServerId}`);
    } catch (error) {
      log.error(`Failed to remove container for MCP server ${mcpServerId}:`, error);
      throw error;
    }
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

  // Get all available tools with execute functions
  getAllTools(): McpTools {
    const allTools: McpTools = {} as McpTools;

    for (const [serverId, serverTools] of this.availableTools) {
      for (const [toolName, tool] of Object.entries(serverTools)) {
        // Use : separator to combine server ID and tool name
        // This allows us to reliably extract the server ID later
        const toolId = `${serverId}:${toolName}`;

        allTools[toolId] = tool;
      }
    }

    return allTools;
  }

  // Get specific tools by IDs
  getToolsById(toolIds: string[]): Partial<McpTools> {
    const allTools = this.getAllTools();
    const selected: Partial<McpTools> = {};

    for (const toolId of toolIds) {
      if (allTools[toolId]) {
        selected[toolId] = allTools[toolId];
      }
    }

    return selected;
  }
}

export default new McpServerSandboxManager();
