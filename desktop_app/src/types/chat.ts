import type {
  ChatMessage as BaseChatMessage,
  ChatWithMessages as BaseChatWithMessages,
} from '@clients/archestra/api/gen';

import { ToolCall } from './mcpServer';

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
