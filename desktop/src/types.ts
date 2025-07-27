import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';
import { LucideIcon } from 'lucide-react';

import type {
  ChatInteraction as BaseChatInteraction,
  ChatWithInteractions as BaseChatWithInteractions,
  McpServerDefinition,
} from '@/lib/api-client';

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

export interface ConnectedMCPServer extends McpServerDefinition {
  url: string;
  client: Client | null;
  tools: ToolWithMCPServerName[];
  status: MCPServerStatus;
  error?: string;
}

export enum ToolCallStatus {
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Error = 'error',
}

export interface ToolCallInfo {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
  executionTime?: number;
  startTime: Date;
  endTime?: Date;
}

// ChatMessage interface for v5 SDK
export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  thinkingContent?: string;
  timestamp: Date;
  isStreaming?: boolean;
  isThinkingStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
  isToolExecuting?: boolean;
  isFromAgent?: boolean;
  agentMetadata?: {
    planId?: string;
    stepId?: string;
    reasoningText?: {
      id: string;
      type: 'planning' | 'decision' | 'evaluation' | 'adaptation';
      content: string;
      alternatives?: Array<{
        id: string;
        description: string;
      }>;
    };
    memorySnapshot?: string;
    isAgentGenerated: boolean;
  };
}

export enum ChatInteractionStatus {
  Submitted = 'submitted',
  Streaming = 'streaming',
  Ready = 'ready',
  Error = 'error',
}

export enum ChatInteractionRole {
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
  System = 'system',
  Error = 'error',
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

export interface ChatWithInteractions extends BaseChatWithInteractions {
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
