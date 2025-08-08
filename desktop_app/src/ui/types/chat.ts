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

export interface ChatWithMessages extends ServerChatWithMessagesRepresentation {
  /**
   * messages is a superset of the messages field in the backend API
   */
  messages: UIMessage[];
}

export { type ServerChatMessageRepresentation, type ServerChatWithMessagesRepresentation };
