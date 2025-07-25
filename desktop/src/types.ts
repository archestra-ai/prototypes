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
