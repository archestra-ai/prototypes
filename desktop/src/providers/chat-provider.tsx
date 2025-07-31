import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReactNode, createContext, useContext, useEffect, useMemo } from 'react';

import { ARCHESTRA_SERVER_BASE_HTTP_URL } from '@/consts';
import { useChatStore } from '@/stores/chat-store';
import { useOllamaStore } from '@/stores/ollama-store';
import { ChatMessageStatus } from '@/types';

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
  });

  // Load messages when the current chat changes or when component mounts
  useEffect(() => {
    // Load messages from the selected chat
    const currentChat = useChatStore.getState().getCurrentChat();
    if (currentChat && currentChat.messages.length > 0) {
      chat.setMessages(currentChat.messages);
    } else {
      chat.setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatSessionId]); // Don't include chat in dependencies to avoid infinite loop

  // Sync messages back to the store when they change
  useEffect(() => {
    if (currentChatSessionId && chat.messages.length > 0) {
      useChatStore.getState().updateChatMessages(currentChatSessionId, chat.messages);
    }
  }, [chat.messages, currentChatSessionId]);

  // Expose stop function globally for chat deletion
  useEffect(() => {
    window.__CHAT_STOP_STREAMING__ = () => {
      if (chat.status === 'streaming') {
        chat.stop();
      }
    };

    return () => {
      window.__CHAT_STOP_STREAMING__ = undefined;
    };
  }, [chat.status, chat.stop]);

  // Update the chat store status when streaming changes
  useEffect(() => {
    if (chat.status === 'streaming') {
      useChatStore.getState().setStatus(ChatMessageStatus.Streaming);
      // Track which chat is streaming
      useChatStore.getState().setStreamingChatSessionId(currentChatSessionId);
    } else {
      useChatStore.getState().setStatus(ChatMessageStatus.Ready);
      // Clear streaming chat when done
      useChatStore.getState().setStreamingChatSessionId(null);
    }
  }, [chat.status, currentChatSessionId]);

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
