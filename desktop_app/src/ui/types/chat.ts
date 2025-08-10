import { type UIMessage } from 'ai';

import type { ChatWithMessages as ServerChatWithMessagesRepresentation } from '@ui/lib/clients/archestra/api/gen';

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

export interface ChatWithMessages {
  id: number;
  sessionId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * messages is UIMessage array from the 'ai' SDK
   */
  messages: UIMessage[];
}

export { type ServerChatMessageRepresentation, type ServerChatWithMessagesRepresentation };
