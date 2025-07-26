import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useState } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useAgentStore } from '@/stores/agent-store';
import { useOllamaStore } from '@/stores/ollama-store';

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
  const { selectedModel } = useOllamaStore();
  const { isAgentActive } = useAgentStore();
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<Error | null>(null);

  // Configure useChat with our SSE endpoint
  const { messages, sendMessage, status, error, stop, regenerate, setMessages, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/chat`,
      headers: () => ({
        'Content-Type': 'application/json',
      }),
    }),
    onError: (error) => {
      console.error('[useSSEChat] Chat error:', error);
      setCustomError(error);
      options?.onError?.(error);
    },
    onFinish: ({ message }) => {
      console.log('[useSSEChat] Chat finished:', { message });
      options?.onFinish?.({ message });
    },
    onToolCall: async ({ toolCall }) => {
      console.log('[useSSEChat] Tool call:', { toolCall });
      await options?.onToolCall?.({ toolCall });
    },
  });

  // Custom sendMessage that includes our metadata
  const sendChatMessage = useCallback(
    async (
      text: string,
      options?: {
        tools?: string[];
        agentContext?: any;
      }
    ) => {
      try {
        console.log('[useSSEChat] Sending message:', { text, options });
        setCustomError(null);

        // Build the message with proper formatting
        await sendMessage(
          { text },
          {
            body: {
              model: selectedModel,
              tools: options?.tools,
              agent_context:
                options?.agentContext ||
                (isAgentActive
                  ? {
                      mode: 'autonomous',
                    }
                  : undefined),
            },
          }
        );

        console.log('[useSSEChat] Message sent successfully');
      } catch (err) {
        console.error('[useSSEChat] Error sending message:', err);
        setCustomError(err as Error);
        throw err;
      }
    },
    [sendMessage, selectedModel, isAgentActive]
  );

  // Handle input state separately to match existing pattern
  const handleInputChange = useCallback((value: string) => {
    setCustomInput(value);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (customInput.trim()) {
        try {
          await sendChatMessage(customInput);
          setCustomInput('');
        } catch (err) {
          console.error('[useSSEChat] Submit error:', err);
        }
      }
    },
    [customInput, sendChatMessage]
  );

  // Process agent-specific data parts from messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
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
  }, [messages]);

  // Log status changes
  useEffect(() => {
    console.log('[useSSEChat] Status changed:', status);
  }, [status]);

  // Log messages when they change
  useEffect(() => {
    console.log('[useSSEChat] Messages updated:', messages.length, messages);
  }, [messages]);

  // Log errors
  useEffect(() => {
    if (error || customError) {
      console.error('[useSSEChat] Current error:', error || customError);
    }
  }, [error, customError]);

  return {
    // Message state
    messages,
    setMessages,

    // Input handling
    input: customInput,
    setInput: handleInputChange,
    handleSubmit,

    // Actions
    sendMessage: sendChatMessage,
    stop,
    reload: regenerate,
    addToolResult,

    // Status
    status,
    isLoading: status === 'streaming',
    error: error || customError,

    // Helper to check if can send message
    canSend: status === 'ready' && customInput.trim().length > 0,
  };
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
