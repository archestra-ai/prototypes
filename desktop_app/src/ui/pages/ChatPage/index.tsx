import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Skeleton } from '@ui/components/ui/skeleton';
import config from '@ui/config';
import { useChatStore, useCloudProvidersStore, useOllamaStore } from '@ui/stores';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { getCurrentChat } = useChatStore();
  const { selectedModel } = useOllamaStore();
  const { availableCloudProviderModels } = useCloudProvidersStore();
  const [localInput, setLocalInput] = useState('');

  const currentChat = getCurrentChat();
  const currentChatSessionId = currentChat?.sessionId || '';
  const currentChatMessages = currentChat?.messages || [];

  // Use a ref to always get the current model value
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  // Create transport once, but use ref for dynamic values
  const transport = useMemo(() => {
    // Always use the unified stream endpoint
    const apiEndpoint = `${config.archestra.chatStreamBaseUrl}/openai/stream`;

    return new DefaultChatTransport({
      api: apiEndpoint,
      prepareSendMessagesRequest: ({ id, messages }) => {
        // Use ref to get current model value
        const currentModel = selectedModelRef.current;

        // Find if this is a cloud model and get its provider
        const cloudModel = availableCloudProviderModels.find((m) => m.id === currentModel);
        console.log('here is', cloudModel);
        console.log('here is', currentModel);
        const provider = cloudModel ? cloudModel.provider : 'ollama';

        return {
          body: {
            messages,
            model: currentModel || 'llama3.1:8b',
            sessionId: id || currentChatSessionId,
            provider: provider,
          },
        };
      },
    });
  }, [currentChatSessionId, availableCloudProviderModels]); // Don't depend on selectedModel

  const { sendMessage, messages, setMessages, stop, status, error } = useChat({
    id: currentChatSessionId || 'temp-id', // use the provided chat ID or a temp ID
    transport,
    onFinish: (message) => {
      console.log('Message finished:', message);
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  const isLoading = status === 'streaming';

  // Load messages from database when chat changes
  useEffect(() => {
    if (currentChatMessages && currentChatMessages.length > 0) {
      // Messages are already UIMessage type
      setMessages(currentChatMessages);
    } else {
      // Clear messages when no chat or empty chat
      setMessages([]);
    }
  }, [currentChatSessionId]); // Only depend on session ID to avoid infinite loop

  // Log messages updates
  useEffect(() => {
    console.log('All messages in ChatPage:', messages);
    console.log('Messages length:', messages.length);
    console.log('isLoading:', isLoading);
    console.log('error:', error);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      console.log('Last message:', lastMessage);
    }
  }, [messages, isLoading, error]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInput(e.target.value);
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (localInput.trim()) {
      console.log('Sending message:', localInput);
      sendMessage({ text: localInput });
      setLocalInput('');
    }
  };

  return (
    <div className="flex flex-col h-full gap-2 max-w-full overflow-hidden">
      {/* TODO: this is a temporary skeleton, let's make some cool loading animations with a mascot :) */}
      {!currentChat ? (
        <Skeleton className="h-1/4 w-1/4 mx-auto mt-10" />
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-hidden max-w-full">
            <ChatHistory messages={messages} />
          </div>
          <SystemPrompt />
          <div className="flex-shrink-0">
            <ChatInput
              input={localInput}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              stop={stop}
            />
          </div>
        </>
      )}
    </div>
  );
}
