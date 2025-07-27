import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReactNode, createContext, useContext, useEffect, useMemo } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useOllamaStore } from '@/stores/ollama-store';

// Use window object to share metadata between ChatInput and ChatProvider
// This is necessary because prepareSendMessagesRequest doesn't have access to React state
// and Vercel AI SDK v5 doesn't provide a way to pass metadata through sendMessage
declare global {
  interface Window {
    __CHAT_METADATA__: any;
  }
}

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  // Create transport with prepareSendMessagesRequest to add required metadata
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/chat/stream`,
      prepareSendMessagesRequest: ({ messages }) => {
        // Get the current model from Ollama store
        const { selectedModel } = useOllamaStore.getState();

        // Get metadata from window object (set by ChatInput)
        const metadata = window.__CHAT_METADATA__ || {};

        // Build the request body with required fields and metadata
        const body = {
          messages: messages,
          model: metadata.model || selectedModel || 'qwen3:4b',
          tools: metadata.tools,
          agent_context: metadata.agent_context,
          stream: true,
        };

        console.log('[ChatProvider] Sending request with body:', body);

        // Clear metadata after use to prevent stale data
        window.__CHAT_METADATA__ = undefined;

        return { body };
      },
    });
  }, []);

  // Single useChat instance that will be shared across all components
  const chat = useChat({
    transport: chatTransport,
    onError: (error) => {
      console.error('[ChatProvider] Error:', error);
    },
    onFinish: (message) => {
      console.log('[ChatProvider] Message finished:', message);
      console.log('[ChatProvider] Message details:', JSON.stringify(message, null, 2));
    },
    onData: (data) => {
      console.log('[ChatProvider] Data received:', data);
    },
  });

  // Debug logging
  useEffect(() => {
    console.log('[ChatProvider] Messages:', chat.messages);
    console.log('[ChatProvider] Status:', chat.status);
    console.log('[ChatProvider] Messages length:', chat.messages.length);
    if (chat.messages.length > 0) {
      console.log('[ChatProvider] Last message:', chat.messages[chat.messages.length - 1]);
    }
  }, [chat.messages, chat.status]);

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
