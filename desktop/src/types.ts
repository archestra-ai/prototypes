import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';
import { LucideIcon } from 'lucide-react';

import type {
  ChatMessage as BaseChatMessage,
  ChatWithMessages as BaseChatWithMessages,
  ToolCall as BaseToolCall,
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

/**
 * NOTE: the following fields are not part of the backend API, they are only used on the UI side to
 * track the state of tool execution in the UI
 */
// Structured content types for tool outputs
export interface ToolContentText {
  type: 'text';
  text: string;
  annotations?: Record<string, any>;
}

export interface ToolContentImage {
  type: 'image';
  data: string; // base64
  mimeType: string;
  annotations?: Record<string, any>;
}

export type ToolContent = ToolContentText | ToolContentImage;

export interface ToolCall extends BaseToolCall {
  id: string;
  serverName: string;
  name: string;
  arguments: Record<string, any>;
  result: string; // For backward compatibility - text representation
  structuredOutput?: {
    content: ToolContent[];
  };
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

/**
 * NOTE: the following fields are not part of the backend API, they are only used on the UI side to
 * track the state of various things like streaming, thinking, tool execution, etc.
 */
export interface ChatMessage extends Omit<BaseChatMessage, 'tool_calls'> {
  id: string;
  /**
   * toolCalls is a superset of the tool_calls field in the backend API
   */
  toolCalls: ToolCall[];
  thinkingContent: string;
  isStreaming: boolean;
  isToolExecuting: boolean;
  isThinkingStreaming: boolean;
}

export interface ChatWithMessages extends Omit<BaseChatWithMessages, 'messages'> {
  /**
   * messages is a superset of the messages field in the backend API
   */
  messages: ChatMessage[];
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
