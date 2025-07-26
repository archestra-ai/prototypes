import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useState } from 'react';

import { ARCHESTRA_SERVER_API_URL } from '@/consts';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';
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

  // Configure useChat with our SSE endpoint
  const { messages, sendMessage, status, error, stop, regenerate, setMessages, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: `${ARCHESTRA_SERVER_API_URL}/agent/chat`,
      headers: () => ({
        'Content-Type': 'application/json',
      }),
    }),
    onError: options?.onError,
    onFinish: options?.onFinish,
    onToolCall: options?.onToolCall,
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
        await sendChatMessage(customInput);
        setCustomInput('');
      }
    },
    [customInput, sendChatMessage]
  );

  // Sync messages to chat store when they change
  useEffect(() => {
    if (messages.length > 0) {
      // Convert messages to chat store format
      const chatMessages = messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.parts
          .filter((part) => part.type === 'text')
          .map((part) => (part as any).text)
          .join(''),
        timestamp: new Date(),
        // Extract reasoning from parts
        thinkingContent: msg.parts
          .filter((part) => part.type === 'reasoning')
          .map((part) => (part as any).text)
          .join('\n'),
        isStreaming: status === 'streaming' && msg.id === messages[messages.length - 1].id,
      }));

      // Update chat store
      useChatStore.setState({ chatHistory: chatMessages });

      // Process agent-specific messages
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
  }, [messages, status]);

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
    error,

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
