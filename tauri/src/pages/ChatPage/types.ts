export interface IChatMessage {
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

export interface MCPTool {
  serverName: string;
  tool: {
    name: string;
    description?: string;
    inputSchema?: any;
  };
}