import { useChatStore } from '@/stores/chat-store';

import { getDefaultModel, useAIChat } from './use-ai-chat';

interface UseChatProviderOptions {
  model: string;
  sessionId?: string;
  initialMessages?: any[];
}

export function useChatProvider({ model, sessionId, initialMessages = [] }: UseChatProviderOptions) {
  const { selectedProvider, openaiApiKey, anthropicApiKey } = useChatStore();

  // Map the provider names to the AI provider keys
  const providerMap = {
    chatgpt: 'openai',
    claude: 'anthropic',
    ollama: 'ollama',
  } as const;

  const aiProviderKey = providerMap[selectedProvider];

  // Get the appropriate API key based on provider
  let apiKey: string | undefined;
  if (selectedProvider === 'chatgpt') {
    apiKey = openaiApiKey || undefined;
  } else if (selectedProvider === 'claude') {
    apiKey = anthropicApiKey || undefined;
  }
  // ollama doesn't need an API key

  const aiChat = useAIChat({
    provider: aiProviderKey,
    model: model || getDefaultModel(aiProviderKey),
    sessionId,
    initialMessages,
    apiKey,
  });

  return aiChat;
}
