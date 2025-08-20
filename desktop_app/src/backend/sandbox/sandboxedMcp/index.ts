import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type experimental_MCPClient, experimental_createMCPClient } from 'ai';
import type { RawReplyDefaultExpression } from 'fastify';
import { z } from 'zod';

import config from '@backend/config';
import { type McpServer } from '@backend/models/mcpServer';
import PodmanContainer, { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import log from '@backend/utils/logger';

const { host: proxyMcpServerHost, port: proxyMcpServerPort } = config.server.http;

export const McpServerContainerLogsSchema = z.object({
  logs: z.string(),
  containerName: z.string(),
});

export const AvailableToolSchema = z.object({
  id: z.string().describe('Tool ID in format sanitizedServerId:sanitizedToolName'),
  name: z.string().describe('Tool name'),
  description: z.string().optional().describe('Tool description'),
  inputSchema: z.any().optional().describe('Tool input schema'),
  mcpServerId: z.string().describe('MCP server ID'),
  mcpServerName: z.string().describe('MCP server name'),
});

export const SandboxedMcpServerStatusSummarySchema = z.object({
  container: PodmanContainerStatusSummarySchema,
  tools: z.array(AvailableToolSchema),
});

export type McpTools = Awaited<ReturnType<experimental_MCPClient['tools']>>;
export type AvailableTool = z.infer<typeof AvailableToolSchema>;
type SandboxedMcpServerStatusSummary = z.infer<typeof SandboxedMcpServerStatusSummarySchema>;

/**
 * SandboxedMcpServer represents an MCP server running in a podman container.
 */
export default class SandboxedMcpServer {
  mcpServer: McpServer;

  private mcpServerId: string;
  private mcpServerProxyUrl: string;

  private podmanSocketPath: string;
  private podmanContainer: PodmanContainer;

  private mcpClient: experimental_MCPClient;

  tools: McpTools;

  constructor(mcpServer: McpServer, podmanSocketPath: string) {
    this.mcpServer = mcpServer;
    this.mcpServerId = mcpServer.id;
    this.mcpServerProxyUrl = `http://${proxyMcpServerHost}:${proxyMcpServerPort}/mcp_proxy/${this.mcpServerId}`;

    this.podmanSocketPath = podmanSocketPath;
    this.podmanContainer = new PodmanContainer(mcpServer, podmanSocketPath);
  }

  /**
   * Helper function to make schema JSON-serializable by removing symbols
   */
  private cleanToolInputSchema = (
    schema: Awaited<ReturnType<experimental_MCPClient['tools']>>[string]['inputSchema']
  ): any => {
    if (!schema) return undefined;

    try {
      // JSON.parse(JSON.stringify()) removes non-serializable properties like symbols
      return JSON.parse(JSON.stringify(schema));
    } catch {
      return undefined;
    }
  };

  private async connectMcpClient() {
    try {
      log.info(`Attempting to connect MCP client to ${this.mcpServerProxyUrl}`);

      if (!this.mcpClient) {
        const transport = new StreamableHTTPClientTransport(new URL(this.mcpServerProxyUrl));
        this.mcpClient = await experimental_createMCPClient({ transport: transport as any });
      }

      /**
       * Fetch tools and slightly transform their "ids" to be in the format of
       * `<mcp_server_id>:<tool_name>`
       */
      const tools = await this.mcpClient.tools();
      for (const [toolName, tool] of Object.entries(tools)) {
        const toolId = `${this.mcpServerId}:${toolName}`;
        this.tools[toolId] = tool;
      }

      log.info(`Connected MCP client for ${this.mcpServerId}, found ${this.tools.length} tools`);
    } catch (error) {
      log.error(`Failed to connect MCP client for ${this.mcpServerId}:`, error);
    }
  }

  async start() {
    this.podmanContainer = new PodmanContainer(this.mcpServer, this.podmanSocketPath);
    await this.podmanContainer.startOrCreateContainer();

    // Connect MCP client after container is ready
    await this.connectMcpClient();
  }

  async stop() {
    await this.podmanContainer.stopContainer();

    // Clean up MCP client
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }

  /**
   * Stream a request to the MCP server container
   */
  async streamToContainer(request: any, responseStream: RawReplyDefaultExpression) {
    await this.podmanContainer.streamToContainer(request, responseStream);
  }

  /**
   * Get the last N lines of logs from the MCP server container
   */
  async getMcpServerLogs(lines: number = 100) {
    return {
      logs: await this.podmanContainer.getRecentLogs(lines),
      containerName: this.podmanContainer.containerName,
    };
  }

  /**
   * This provides a list of tools in a slightly transformed format
   * that we expose to the UI
   */
  get availableToolsList(): AvailableTool[] {
    return Object.entries(this.tools).map(([id, tool]) => ({
      id,
      name: id,
      description: tool.description,
      inputSchema: this.cleanToolInputSchema(tool.inputSchema),
      mcpServerId: this.mcpServerId,
      mcpServerName: this.mcpServer.name,
    }));
  }

  get statusSummary(): SandboxedMcpServerStatusSummary {
    return {
      container: this.podmanContainer.statusSummary,
      tools: this.availableToolsList,
    };
  }
}
