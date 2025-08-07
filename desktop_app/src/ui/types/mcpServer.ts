import { McpServer } from '@archestra/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';

import type { ToolCall as BaseToolCall } from '@clients/archestra/api/gen';

/**
 * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
 * ARE THE BELOW TYPES STILL NEEDED?
 * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
 */
export enum ToolCallStatus {
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Error = 'error',
}

export interface ToolCall extends BaseToolCall {
  id: string;
  serverName: string;
  name: string;
  arguments: Record<string, any>;
  result: string;
  error: string | null;
  status: ToolCallStatus;
  executionTime: number | null;
  startTime: Date | null;
  endTime: Date | null;
}

export interface ToolWithMcpServerInfo extends BaseTool {
  server: {
    slug: string;
    name: string;
  };
  enabled: boolean;
}

export enum McpServerStatus {
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

/**
 * map of an mcp server slug to its tools
 */
export type McpServerToolsMap = Record<string, ToolWithMcpServerInfo[]>;

export interface ConnectedMcpServer extends McpServer {
  url: string;
  client: Client | null;
  tools: ToolWithMcpServerInfo[];
  status: McpServerStatus;
  error: string | null;
}
