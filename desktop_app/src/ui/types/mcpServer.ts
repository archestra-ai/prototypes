import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpServer } from '@ui/lib/clients/archestra/api/gen';

import { type Tool } from './tools';

export type McpServerUserConfigValues = McpServer['userConfigValues'];

export interface ToolWithMcpServerInfo extends Tool {
  server: {
    /**
     * id is the unique identifier of an mcp server
     * it's the "slug" from the catalog for mcp servers installed via the catalog
     * otherwise, for "custom" mcp servers, it's a UUID
     */
    id: string;
    /**
     * name is the display name of the mcp server
     */
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
