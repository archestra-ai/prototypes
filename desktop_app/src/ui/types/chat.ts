import { type UIMessage } from 'ai';

import type { ChatWithMessages as ServerChatWithMessagesRepresentation } from '@clients/archestra/api/gen';

import { type ToolCall } from './tools';

type ServerChatMessageRepresentation = ServerChatWithMessagesRepresentation['messages'][number];

export type ParsedContent = {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
};

export enum ChatMessageStatus {
  Submitted = 'submitted',
  Streaming = 'streaming',
  Ready = 'ready',
  Error = 'error',
}

export interface ChatMessage extends ServerChatMessageRepresentation {
  /**
   * content is a UIMessage from the 'ai' SDK
   */
  content: UIMessage;
  /**
   * toolCalls is a superset of the tool_calls field in the backend API
   */
  toolCalls: ToolCall[];
  thinkingContent: string;
  isStreaming: boolean;
  isToolExecuting: boolean;
  isThinkingStreaming: boolean;
}

export interface ChatWithMessages extends ServerChatWithMessagesRepresentation {
  /**
   * messages is a superset of the messages field in the backend API
   */
  messages: ChatMessage[];
}

export { type ServerChatMessageRepresentation, type ServerChatWithMessagesRepresentation };
