import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useAgentStore } from '@/stores/agent-store';

// Store metadata outside component to ensure it persists
// This is necessary in v5 because prepareSendMessagesRequest doesn't have access to React state
// See: https://github.com/vercel/ai/issues/6386 and docs/model-selection-implementation.md
let globalMetadata: any = {};

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  // Create transport with prepareSendMessagesRequest to customize the request body
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/chat/stream`,
      prepareSendMessagesRequest: ({ messages }) => {
        // Build the request body with messages and metadata
        const body = {
          messages: messages,
          model: globalMetadata.model,
          tools: globalMetadata.tools,
          agent_context: globalMetadata.agent_context,
          stream: true,
        };

        console.log('[ChatProvider] Preparing request body:', body);
        // Return an object with the body property
        return { body };
      },
    });
  }, []);

  // Single useChat instance that will be shared across all components
  const chat = useChat({
    id: 'main-chat',
    transport: chatTransport,
    onError: (error) => {
      console.error('[ChatProvider] Chat error:', error);
    },
    onFinish: (message) => {
      console.log('[ChatProvider] Chat finished:', message);
    },
  });

  // Override sendMessage to capture metadata
  const sendMessage = useCallback(
    (content: any) => {
      if (typeof content === 'object' && content.metadata) {
        // Update global metadata
        globalMetadata = {
          model: content.metadata.model,
          tools: content.metadata.tools,
          agent_context: content.metadata.agent_context,
        };
        console.log('[ChatProvider] Updated metadata:', globalMetadata);
      }
      return chat.sendMessage(content);
    },
    [chat.sendMessage]
  );

  // Create a new chat object with our overridden sendMessage
  const enhancedChat = useMemo(
    () => ({
      ...chat,
      sendMessage,
    }),
    [chat, sendMessage]
  );

  // Process agent-specific data parts from messages
  useEffect(() => {
    if (chat.messages.length > 0) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage?.parts) {
        lastMessage.parts.forEach((part: any) => {
          if (part.type === 'data' && part.data) {
            const { type: dataType, ...data } = part.data;

            if (dataType === 'agent-state') {
              const agentStore = useAgentStore.getState();
              if (data.mode) {
                agentStore.setAgentMode(data.mode);
              }
              if (data.objective) {
                useAgentStore.setState({ currentObjective: data.objective });
              }
            } else if (dataType === 'reasoning') {
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
              const agentStore = useAgentStore.getState();
              agentStore.updateProgress(data);
            }
          }
        });
      }
    }
  }, [chat.messages]);

  // Debug logging
  useEffect(() => {
    console.log('[ChatProvider] Messages updated:', chat.messages.length);
  }, [chat.messages.length]);

  return <ChatContext.Provider value={enhancedChat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
