import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { McpServerDefinition } from '@/lib/api-client';

export interface ConnectedMCPServer extends McpServerDefinition {
  url: string;
  client: Client | null;
  tools: Tool[];
  status: 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface ToolCallInfo {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
  startTime: Date;
  endTime?: Date;
}
