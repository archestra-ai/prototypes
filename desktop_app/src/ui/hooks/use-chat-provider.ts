import { getDefaultModel, useAIChatBackend } from './use-ai-chat-backend';

interface UseChatProviderOptions {
  model: string;
  sessionId?: string;
  initialMessages?: any[];
}

export function useChatProvider({ model, sessionId, initialMessages = [] }: UseChatProviderOptions) {
  const aiChat = useAIChatBackend({
    provider: 'ollama',
    model: model || getDefaultModel('ollama'),
    sessionId,
    initialMessages,
  });

  return aiChat;
}
