import { useChat } from '@ai-sdk/react';
import { useCallback } from 'react';

interface UseAIChatBackendOptions {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  sessionId?: string;
  initialMessages?: any[];
  apiKey?: string;
}

// Provider configuration type
interface AIProviderConfig {
  name: string;
  models: Record<string, { displayName: string; default: boolean }>;
  apiKeyPlaceholder: string;
  apiKeyEnvVar: string;
}

// Centralized AI Provider Configuration (same as original)
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
  },
};

export type AIProviderType = keyof typeof AI_PROVIDERS;

// Helper function to get default model for a provider
export function getDefaultModel(provider: AIProviderType): string {
  const models = AI_PROVIDERS[provider].models;
  const defaultModel = Object.entries(models).find(([_, config]) => config.default);
  return defaultModel ? defaultModel[0] : Object.keys(models)[0];
}

export function useAIChatBackend({
  provider,
  model,
  sessionId,
  initialMessages = [],
  apiKey,
}: UseAIChatBackendOptions) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop, error, append, setMessages, sendMessage } =
    useChat({
      api: 'http://localhost:3456/api/llm/stream',
      initialMessages,
      body: {
        model: model || getDefaultModel(provider),
        apiKey,
        sessionId,
      },
      onError: (error) => {
        console.error('Chat error:', error);
      },
    });

  return {
    messages,
    sendMessage,
    status: isLoading ? 'streaming' : error ? 'error' : 'ready',
    stop,
    isLoading,
    // Additional utilities from useChat that might be useful
    input,
    handleInputChange,
    handleSubmit,
    setMessages,
  };
}
