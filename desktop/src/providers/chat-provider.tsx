import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { ARCHESTRA_SERVER_BASE_HTTP_URL } from '@/consts';
import { useChatStore } from '@/stores/chat-store';
import { useOllamaStore } from '@/stores/ollama-store';

import { handleDataEvent } from './chat-provider/event-handlers';

// Use window object to share metadata between ChatInput and ChatProvider
// This is necessary because prepareSendMessagesRequest doesn't have access to React state
// and Vercel AI SDK v5 doesn't provide a way to pass metadata through sendMessage
declare global {
  interface Window {
    __CHAT_METADATA__: any;
    __CHAT_STOP_STREAMING__?: () => void;
  }
}

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const currentChatSessionId = useChatStore((state) => state.currentChatSessionId);
  const prevChatSessionIdRef = useRef(currentChatSessionId);

  // Create transport with prepareSendMessagesRequest to add required metadata
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_BASE_HTTP_URL}/llm/ollama/stream`,
      prepareSendMessagesRequest: ({ messages }: { messages: any[] }) => {
        // Get the current model from Ollama store
        const { selectedModel } = useOllamaStore.getState();

        // Get metadata from window object (set by ChatInput)
        const metadata = window.__CHAT_METADATA__ || {};

        // Get the current chat session ID
        const currentChatSessionId = useChatStore.getState().currentChatSessionId;

        // Build the request body with required fields and metadata
        const body = {
          session_id: currentChatSessionId,
          messages: messages,
          model: metadata.model || selectedModel || 'qwen3:4b',
          tools: metadata.tools,
          agent_context: metadata.agent_context,
          stream: true,
          options: metadata.options,
        };

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
      handleDataEvent(data);
    },
  });

  // Load messages when the current chat changes
  useEffect(() => {
    // Only update if the chat session actually changed
    if (prevChatSessionIdRef.current !== currentChatSessionId) {
      console.log('[ChatProvider] Chat session changed from', prevChatSessionIdRef.current, 'to', currentChatSessionId);
      prevChatSessionIdRef.current = currentChatSessionId;

      // Load messages from the selected chat
      const currentChat = useChatStore.getState().getCurrentChat();
      if (currentChat && currentChat.messages.length > 0) {
        console.log('[ChatProvider] Loading messages from selected chat:', currentChat.messages.length);
        chat.setMessages(currentChat.messages);
      } else {
        console.log('[ChatProvider] No messages to load, clearing messages');
        chat.setMessages([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatSessionId]); // Don't include chat in dependencies to avoid infinite loop

  // Sync messages back to the store when they change
  useEffect(() => {
    if (currentChatSessionId && chat.messages.length > 0) {
      console.log('[ChatProvider] Syncing messages to store:', chat.messages.length);
      useChatStore.getState().updateChatMessages(currentChatSessionId, chat.messages);
    }
  }, [chat.messages, currentChatSessionId]);

  // Expose stop function globally for chat deletion
  useEffect(() => {
    window.__CHAT_STOP_STREAMING__ = () => {
      if (chat.status === 'streaming') {
        console.log('[ChatProvider] Stopping streaming for chat deletion');
        chat.stop();
      }
    };

    return () => {
      window.__CHAT_STOP_STREAMING__ = undefined;
    };
  }, [chat]);

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
