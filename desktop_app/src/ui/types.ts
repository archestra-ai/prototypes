import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';
import { UIMessage } from 'ai';
import { LucideIcon } from 'lucide-react';

import type {
  ChatWithMessages as BaseChatWithMessages,
  McpServer as BaseMcpServer,
  ToolCall as BaseToolCall,
} from '@ui/lib/api-client';

export interface ToolWithMCPServerName extends BaseTool {
  serverName: string;
  enabled: boolean;
}

export type MCPServerToolsMap = Record<string, ToolWithMCPServerName[]>;

export enum MCPServerStatus {
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

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

export enum ToolCallStatus {
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Error = 'error',
}

/**
 * NOTE: the following fields are not part of the backend API, they are only used on the UI side to
 * track the state of tool execution in the UI
 */
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

export enum ChatMessageStatus {
  Submitted = 'submitted',
  Streaming = 'streaming',
  Ready = 'ready',
  Error = 'error',
}

export interface ChatWithMessages extends Omit<BaseChatWithMessages, 'messages'> {
  /**
   * messages is a superset of the messages field in the backend API
   */
  messages: UIMessage[];
}

export interface ChatTitleUpdatedEvent {
  chat_id: number;
  title: string;
}

export enum NavigationViewKey {
  Chat = 'chat',
  LLMProviders = 'llm-providers',
  MCP = 'mcp',
  Settings = 'settings',
}

export enum NavigationSubViewKey {
  Ollama = 'ollama',
}

export interface NavigationItem {
  title: string;
  icon: LucideIcon;
  key: NavigationViewKey;
}
