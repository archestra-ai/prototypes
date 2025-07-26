import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';
import { LucideIcon } from 'lucide-react';

import type { ChatInteraction as BaseChatInteraction, Chat, McpServerDefinition } from '@/lib/api-client';

export interface ToolWithMCPServerName extends BaseTool {
  serverName: string;
  enabled: boolean;
}

export type MCPServerToolsMap = Record<string, ToolWithMCPServerName[]>;

export interface ConnectedMCPServer extends McpServerDefinition {
  url: string;
  client: Client | null;
  tools: ToolWithMCPServerName[];
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

export interface ChatInteraction extends BaseChatInteraction {
  /**
   * NOTE: for right now, the content is coming from the server as a jsonified string.. we'll worry about
   * better typing here later
   */
  content: any;
  isStreaming: boolean;
  isToolExecuting: boolean;
  isThinkingStreaming: boolean;
}

export interface ChatWithInteractions {
  chat: Chat;
  interactions: ChatInteraction[];
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
