import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ServerConfig {
  transport: string;
  command: string;
  args: string[];
  env: { [key: string]: string };
}

export interface MCPServer {
  name: string;
  url: string;
  server_config?: ServerConfig;
  meta?: { [key: string]: any };
}

export interface MCPServerWithClientAndTools extends MCPServer {
  client: Client | null;
  tools: Tool[];
}

export interface MCPServerStatusAndError {
  status: 'connecting' | 'connected' | 'error';
  error?: string;
}

export type MCPServerWithClientAndToolsAndStatus = MCPServerWithClientAndTools & MCPServerStatusAndError;

export interface ToolCallInfo {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
  status: "pending" | "executing" | "completed" | "error";
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
}
