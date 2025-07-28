import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
import { useOllamaStore } from '@/stores/ollama-store';

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
      api: `${ARCHESTRA_SERVER_API_URL}/chat/stream`,
      prepareSendMessagesRequest: ({ messages }: { messages: any[] }) => {
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

      // Handle custom data events with data- prefix
      if (data.type && data.type.startsWith('data-')) {
        const dataType = data.type.substring(5); // Remove 'data-' prefix
        const eventData = data.data as any;

        // Handle agent state updates
        if (dataType === 'agent-state' && eventData) {
          console.log('[ChatProvider] Agent state update:', eventData);
          const store = useAgentStore.getState();

          if (eventData.mode) {
            // Map backend modes to frontend AgentMode
            switch (eventData.mode) {
              case 'planning':
                store.setAgentMode('planning');
                break;
              case 'executing':
                store.setAgentMode('executing');
                break;
              case 'completed':
                store.setAgentMode('completed');
                // After a short delay, transition back to idle
                setTimeout(() => {
                  store.stopAgent();
                }, 2000);
                break;
              default:
                store.setAgentMode('initializing');
            }
          }

          // Update objective if provided
          if (eventData.objective) {
            useAgentStore.setState({
              currentObjective: eventData.objective,
              isAgentActive: true,
            });
          }
        }

        // Handle reasoning events
        if (dataType === 'reasoning' && eventData) {
          console.log('[ChatProvider] Reasoning update:', eventData);
          const { addReasoningEntry } = useAgentStore.getState();

          if (eventData.content) {
            addReasoningEntry({
              id: Date.now().toString(),
              type: eventData.type || 'planning',
              content: eventData.content,
              confidence: 0.8, // Default confidence
              timestamp: new Date(),
            });
          }
        }

        // Handle task progress events
        if (dataType === 'task-progress' && eventData?.progress) {
          console.log('[ChatProvider] Task progress update:', eventData.progress);
          const { updateProgress } = useAgentStore.getState();
          updateProgress(eventData.progress);
        }

        // Handle tool call events
        if (dataType === 'tool-call' && eventData) {
          console.log('[ChatProvider] Tool call event:', eventData);
          // Tool events are now handled through the data- prefix
          // The UI components will process these through the message parts
        }
      }
    },
  });

  // Clear messages when the current chat changes or is deleted
  useEffect(() => {
    // Only clear if the chat session actually changed
    if (prevChatSessionIdRef.current !== currentChatSessionId) {
      console.log('[ChatProvider] Chat session changed from', prevChatSessionIdRef.current, 'to', currentChatSessionId);
      prevChatSessionIdRef.current = currentChatSessionId;
      chat.setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatSessionId]); // Don't include chat in dependencies to avoid infinite loop

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
