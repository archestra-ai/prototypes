import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useMemo } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';

interface UseSSEChatOptions {
  onError?: (error: Error) => void;
  onFinish?: (options: { message: any }) => void;
  onToolCall?: (options: { toolCall: any }) => void | Promise<void>;
}

/**
 * Custom hook that wraps Vercel AI SDK's useChat for SSE streaming
 * Provides unified interface for both chat modes
 */
export function useSSEChat(options?: UseSSEChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${ARCHESTRA_SERVER_API_URL}/chat`,
      }),
    []
  );

  const chat = useChat({
    id: 'main-chat',
    transport,
    onError: (error) => {
      console.error('[useSSEChat] Chat error:', error);
      options?.onError?.(error);
    },
    onFinish: (message) => {
      console.log('[useSSEChat] Chat finished:', message);
      options?.onFinish?.(message);
    },
    onToolCall: options?.onToolCall,
  });

  return chat;
}

/**
 * Convert message parts to display format
 */
export function useMessageParts(message: any) {
  const textParts = message.parts.filter((part: any) => part.type === 'text').map((part: any) => part.text);

  const reasoningParts = message.parts.filter((part: any) => part.type === 'reasoning').map((part: any) => part.text);

  const toolParts = message.parts.filter((part: any) => part.type === 'tool-call' || part.type === 'tool-result');

  const fileParts = message.parts.filter((part: any) => part.type === 'file' && part.mediaType?.startsWith('image/'));

  return {
    text: textParts.join(''),
    reasoning: reasoningParts.join('\n'),
    hasTools: toolParts.length > 0,
    tools: toolParts,
    images: fileParts,
  };
}
