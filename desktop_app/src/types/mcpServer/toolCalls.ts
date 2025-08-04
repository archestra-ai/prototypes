import { Tool as BaseTool } from '@modelcontextprotocol/sdk/types.js';

import type { ToolCall as BaseToolCall } from '@clients/archestra/api/gen';

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

export interface ToolWithMCPServerName extends BaseTool {
  serverName: string;
  enabled: boolean;
}
