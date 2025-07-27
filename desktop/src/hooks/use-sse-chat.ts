import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useAgentStore } from '@/stores/agent-store';

interface UseSSEChatOptions {
  onError?: (error: Error) => void;
  onFinish?: (options: { message: any }) => void;
  onToolCall?: (options: { toolCall: any }) => void | Promise<void>;
}

/**
 * Custom hook that wraps Vercel AI SDK's useChat for SSE streaming
 * Provides unified interface for both chat and agent modes
 */
export function useSSEChat(options?: UseSSEChatOptions) {
  const chat = useChat({
    // Use a consistent ID so multiple components share the same chat state
    id: 'main-chat',
    // Configure transport to use our backend endpoint
    transport: new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/chat`,
    }),
    // Body should be passed when sending messages, not here
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

  // Process agent-specific data parts from messages
  useEffect(() => {
    if (chat.messages.length > 0) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage?.parts) {
        lastMessage.parts.forEach((part: any) => {
          if (part.type === 'data' && part.data) {
            const { type: dataType, ...data } = part.data;

            if (dataType === 'agent-state') {
              // Update agent state
              const agentStore = useAgentStore.getState();
              if (data.mode) {
                agentStore.setAgentMode(data.mode);
              }
              if (data.objective) {
                useAgentStore.setState({ currentObjective: data.objective });
              }
            } else if (dataType === 'reasoning') {
              // Add reasoning entry
              const agentStore = useAgentStore.getState();
              agentStore.addReasoningEntry({
                id: crypto.randomUUID(),
                type: data.type || 'planning',
                content: data.content || '',
                alternatives: [],
                timestamp: new Date(),
                confidence: data.confidence || 0.8,
              });
            } else if (dataType === 'task-progress') {
              // Update task progress
              const agentStore = useAgentStore.getState();
              agentStore.updateProgress(data);
            }
          }
        });
      }
    }
  }, [chat.messages]);

  // Log available properties in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[useSSEChat] Hook called with ID:', 'main-chat');
    console.log('[useSSEChat] Messages count:', chat.messages.length);
    console.log('[useSSEChat] Status:', chat.status);
    console.log('[useSSEChat] Chat instance ID:', (chat as any).id);

    // Log detailed message structure
    if (chat.messages.length > 0) {
      chat.messages.forEach((msg, idx) => {
        console.log(`[useSSEChat] Message ${idx}:`, {
          id: msg.id,
          role: msg.role,
          content: (msg as any).content,
          text: (msg as any).text,
          parts: msg.parts,
          partsCount: msg.parts?.length,
        });
        if (msg.parts) {
          msg.parts.forEach((part: any, partIdx: number) => {
            console.log(`[useSSEChat] Message ${idx} Part ${partIdx}:`, part);
          });
        }
      });
    }

    if (chat.error) {
      console.error('[useSSEChat] Error:', chat.error);
    }
  }

  // Return the chat interface directly from Vercel AI SDK v5
  // v5 doesn't provide input/handleInputChange/handleSubmit - users manage their own input state
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
