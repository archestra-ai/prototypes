import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { ToolWithMCPServerName } from './toolCalls';

export interface MCPServer {
  name: string;
  config: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transport?: string;
  };
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

export type ServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export enum MCPServerStatus {
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export type MCPServerToolsMap = Record<string, ToolWithMCPServerName[]>;

/**
 * The following fields are not part of the backend API, they are only used on the UI side to
 * track the state of the MCP server, and store the MCP server's client, tools, and "status".
 */
export interface ConnectedMCPServer extends MCPServer {
  url: string;
  client: Client | null;
  tools: ToolWithMCPServerName[];
  status: MCPServerStatus;
  error: string | null;
}
