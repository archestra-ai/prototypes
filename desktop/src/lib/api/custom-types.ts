/**
 * Custom types that are not auto-generated from OpenAPI
 * These types bridge the gap between the backend API and frontend expectations
 */
import { ToolCallStatus } from '@/types';

import type { Model, Value } from './types.gen';

// Extended chat model with flattened properties
export interface Chat {
  id: number;
  session_id: string;
  title: string | null;
  llm_provider: string;
  created_at: string;
}

// Chat with messages - properly typed with flattened chat properties
export interface ChatWithMessages extends Chat {
  messages: Model[];
}

// Tool call structure as expected by the frontend
export interface ToolCall {
  id: string;
  serverName: string;
  name: string;
  function: {
    name: string;
    arguments: any;
  };
  arguments: any;
  result: string;
  error: string | null;
  status?: ToolCallStatus;
  executionTime?: number | null;
  startTime?: Date;
  endTime?: Date | null;
}

// Chat message structure
export interface ChatMessage {
  id?: number;
  chat_id?: number;
  content: Value;
  created_at?: string;
  role?: string;
  tool_calls?: ToolCall[];
}
