import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type { McpServer as BaseMcpServer } from '@clients/archestra/api/gen';

import { ToolWithMCPServerName } from './toolCalls';

/**
 * NOTE: we can get rid of this once we have the MCP catalog setup
 *
 * Sync with Matvey :)
 */
export interface ConnectorCatalogEntry {
  id: string;
  title: string;
  description: string;
  image: string | null;
  category: string;
  tags: string[];
  author: string;
  version: string;
  homepage: string;
  repository: string;
  oauth?: {
    provider: string;
    required: boolean;
  };
  server_config: {
    transport: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  };
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
export interface ConnectedMCPServer extends BaseMcpServer {
  url: string;
  client: Client | null;
  tools: ToolWithMCPServerName[];
  status: MCPServerStatus;
  error: string | null;
}
