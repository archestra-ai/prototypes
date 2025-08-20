import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type experimental_MCPClient, experimental_createMCPClient } from 'ai';
import type { RawReplyDefaultExpression } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import config from '@backend/config';
import { type McpServer } from '@backend/models/mcpServer';
import PodmanContainer, { PodmanContainerStatusSummarySchema } from '@backend/sandbox/podman/container';
import log from '@backend/utils/logger';

const { host: proxyMcpServerHost, port: proxyMcpServerPort } = config.server.http;

/**
 * We use a double underscore to separate the MCP server ID from the tool name.
 *
 * this is for LLM compatability..
 */
const TOOL_ID_SEPARATOR = '__';

export const McpServerContainerLogsSchema = z.object({
  logs: z.string(),
  containerName: z.string(),
});

export const AvailableToolSchema = z.object({
  id: z.string().describe('Tool ID in format sanitizedServerId__sanitizedToolName'),
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

  tools: McpTools = {};

  constructor(mcpServer: McpServer, podmanSocketPath: string) {
    this.mcpServer = mcpServer;
    this.mcpServerId = mcpServer.id;
    this.mcpServerProxyUrl = `http://${proxyMcpServerHost}:${proxyMcpServerPort}/mcp_proxy/${this.mcpServerId}`;

    this.podmanSocketPath = podmanSocketPath;
    this.podmanContainer = new PodmanContainer(mcpServer, podmanSocketPath);
  }

  /**
   * Fetchs tools from the sandboxed MCP server's container and slightly transforms their "ids" to be in the format of
   * `<mcp_server_id>${TOOL_ID_SEPARATOR}<tool_name>`
   */
  private async fetchTools() {
    log.info(`Fetching tools for ${this.mcpServerId}...`);

    const tools = await this.mcpClient.tools();
    for (const [toolName, tool] of Object.entries(tools)) {
      const toolId = `${this.mcpServerId}${TOOL_ID_SEPARATOR}${toolName}`;
      this.tools[toolId] = tool;
    }

    log.info(`Fetched ${Object.keys(this.tools).length} tools for ${this.mcpServerId}`);
  }

  private async createMcpClient() {
    if (this.mcpClient) {
      return;
    }

    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.mcpServerProxyUrl));
      this.mcpClient = await experimental_createMCPClient({ transport: transport as any });
    } catch (error) {
      log.error(`Failed to connect MCP client for ${this.mcpServerId}:`, error);
    }
  }

  /**
   * This is a (semi) temporary way of ensuring that the MCP server container
   * is fully ready before attempting to communicate with it.
   *
   * https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/ping#ping
   *
   * TODO: this should be baked into the MCP Server Dockfile's health check (to replace the current one)
   */
  private async pingMcpServerContainerUntilHealthy() {
    const MAX_PING_ATTEMPTS = 10;
    const PING_INTERVAL_MS = 500;
    let attempts = 0;

    while (attempts < MAX_PING_ATTEMPTS) {
      log.info(`Pinging MCP server container ${this.mcpServerId} until healthy...`);

      const response = await fetch(this.mcpServerProxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: uuidv4(),
          method: 'ping',
        }),
      });

      if (response.ok) {
        log.info(`MCP server container ${this.mcpServerId} is healthy!`);
        return;
      } else {
        log.info(`MCP server container ${this.mcpServerId} is not healthy, retrying...`);
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, PING_INTERVAL_MS));
      }
    }
  }

  async start() {
    this.podmanContainer = new PodmanContainer(this.mcpServer, this.podmanSocketPath);

    await this.podmanContainer.startOrCreateContainer();
    await this.pingMcpServerContainerUntilHealthy();
    await this.createMcpClient();
    await this.fetchTools();
  }

  async stop() {
    await this.podmanContainer.stopContainer();

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

  /**
   * This provides a list of tools in a slightly transformed format
   * that we expose to the UI
   */
  get availableToolsList(): AvailableTool[] {
    return Object.entries(this.tools).map(([id, tool]) => {
      const separatorIndex = id.indexOf(TOOL_ID_SEPARATOR);
      const toolName = separatorIndex !== -1 ? id.substring(separatorIndex + 1) : id;

      return {
        id,
        name: toolName,
        description: tool.description,
        inputSchema: this.cleanToolInputSchema(tool.inputSchema),
        mcpServerId: this.mcpServerId,
        mcpServerName: this.mcpServer.name,
      };
    });
  }

  get statusSummary(): SandboxedMcpServerStatusSummary {
    return {
      container: this.podmanContainer.statusSummary,
      tools: this.availableToolsList,
    };
  }
}
