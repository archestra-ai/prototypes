import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { useCallback, useRef, useState } from 'react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface UseAIChatOptions {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  sessionId?: string;
  initialMessages?: Message[];
  apiKey?: string;
}

// Provider configuration type
interface AIProviderConfig {
  name: string;
  models: Record<string, { displayName: string; default: boolean }>;
  apiKeyPlaceholder: string;
  apiKeyEnvVar: string;
  createProvider: (apiKey: string) => any;
  streamOptions?: Record<string, any>;
}

// Centralized AI Provider Configuration
export const AI_PROVIDERS: Record<string, AIProviderConfig> = {
  openai: {
    name: 'ChatGPT',
    models: {
      'gpt-4o': { displayName: 'GPT-4 Optimized', default: true },
      'gpt-4-turbo': { displayName: 'GPT-4 Turbo', default: false },
      'gpt-3.5-turbo': { displayName: 'GPT-3.5 Turbo', default: false },
    },
    apiKeyPlaceholder: 'sk-...',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    createProvider: (apiKey: string) =>
      createOpenAI({
        apiKey,
        baseURL: 'https://api.openai.com/v1',
      }),
  },
  anthropic: {
    name: 'Claude',
    models: {
      'claude-3-5-sonnet-20241022': { displayName: 'Claude 3.5 Sonnet', default: true },
      'claude-3-5-haiku-20241022': { displayName: 'Claude 3.5 Haiku', default: false },
      'claude-3-opus-20240229': { displayName: 'Claude 3 Opus', default: false },
    },
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    createProvider: (apiKey: string) =>
      createAnthropic({
        apiKey,
      }),
    streamOptions: {
      headers: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    },
  },
  ollama: {
    name: 'Ollama',
    models: {
      'llama3.2:8b': { displayName: 'Llama 3.2', default: true },
      'llama3.1:8b': { displayName: 'Llama 3.1', default: false },
      mistral: { displayName: 'Mistral', default: false },
      codellama: { displayName: 'Code Llama', default: false },
    },
    apiKeyPlaceholder: '',
    apiKeyEnvVar: '',
    createProvider: () =>
      createOllama({
        baseURL: 'http://localhost:54587/llm/ollama/api',
      }),
  },
};

export type AIProviderType = keyof typeof AI_PROVIDERS;

// Helper function to get default model for a provider
export function getDefaultModel(provider: AIProviderType): string {
  const models = AI_PROVIDERS[provider].models;
  const defaultModel = Object.entries(models).find(([_, config]) => config.default);
  return defaultModel ? defaultModel[0] : Object.keys(models)[0];
}

export function useAIChat({ provider, model, sessionId, initialMessages = [], apiKey }: UseAIChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: Message | string) => {
      const userMessage: Message =
        typeof message === 'string'
          ? { id: Date.now().toString(), role: 'user', content: message }
          : { ...message, id: message.id || Date.now().toString() };

      // Add user message to state
      setMessages((prev) => [...prev, userMessage]);
      setStatus('submitted');

      try {
        // Check if API key is required (not required for ollama)
        if (!apiKey && provider !== 'ollama') {
          throw new Error(
            `${AI_PROVIDERS[provider].name} API key is required. Please set your API key in the settings.`
          );
        }

        abortControllerRef.current = new AbortController();

        // Create AI provider using centralized configuration
        const providerConfig = AI_PROVIDERS[provider];
        const aiProvider = providerConfig.createProvider(apiKey || '');

        // Context to send to the model
        const allMessages = [...messages, userMessage];

        // Use default model if not specified
        const selectedModel = model || getDefaultModel(provider);

        // Create streaming response with provider-specific options
        setStatus('streaming');
        const streamOptions: any = {
          model: aiProvider(selectedModel),
          messages: allMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          abortSignal: abortControllerRef.current.signal,
        };

        // Add provider-specific stream options
        if (providerConfig.streamOptions) {
          Object.assign(streamOptions, providerConfig.streamOptions);
        }

        const result = streamText(streamOptions);

        // Create assistant message placeholder
        const assistantMessageId = `${Date.now()}-assistant`;
        let assistantContent = '';

        // Process the stream
        for await (const chunk of result.textStream) {
          assistantContent += chunk;
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];

            // Update existing assistant message if it's the current streaming message,
            // otherwise create a new assistant message
            if (lastMessage?.role === 'assistant' && lastMessage.id === assistantMessageId) {
              lastMessage.content = assistantContent;
            } else {
              newMessages.push({
                id: assistantMessageId,
                role: 'assistant',
                content: assistantContent,
              });
            }

            return newMessages;
          });
        }

        setStatus('ready');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Chat error:', error);
          setStatus('error');
        }
      }
    },
    [messages, model, sessionId, apiKey, provider]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus('ready');
    }
  }, []);

  return {
    messages,
    sendMessage,
    status,
    stop,
    isLoading: status === 'submitted' || status === 'streaming',
  };
}
