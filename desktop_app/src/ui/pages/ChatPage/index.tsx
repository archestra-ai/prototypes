import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useState } from 'react';

import { useChatStore } from '@ui/stores/chat-store';
import { useCloudProvidersStore } from '@ui/stores/cloud-providers-store';
import { useOllamaStore } from '@ui/stores/ollama-store';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { getCurrentChat, createNewChat, isLoadingChats } = useChatStore();
  const { selectedModel, installedModels } = useOllamaStore();
  const { getAvailableModels } = useCloudProvidersStore();
  const currentChat = getCurrentChat();
  const [localInput, setLocalInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [cloudModels, setCloudModels] = useState<Array<{ id: string; provider: string }>>([]);

  // Ensure we have a chat session
  useEffect(() => {
    // Only create a new chat if we're not loading, there's no current chat, and we're not already creating one
    if (!isLoadingChats && !currentChat && !isCreatingChat) {
      setIsCreatingChat(true);
      createNewChat().finally(() => {
        setIsCreatingChat(false);
      });
    }
  }, [currentChat, createNewChat, isLoadingChats, isCreatingChat]);

  // Load cloud models
  useEffect(() => {
    getAvailableModels().then(setCloudModels);
  }, []);

  // Use selectedModel from Ollama store
  const model = selectedModel || '';

  // Create transport that changes based on model selection
  const transport = useMemo(() => {
    // Check if it's a cloud model
    const isCloudModel = cloudModels.some((m) => m.id === model);

    // Use OpenAI endpoint for cloud models, Ollama for local
    const apiEndpoint = isCloudModel ? '/api/llm/openai/stream' : '/api/llm/ollama/stream';

    return new DefaultChatTransport({
      api: apiEndpoint,
      body: {
        model: model || 'llama3.1:8b',
        sessionId: currentChat?.session_id,
      },
      fetch: async (input, init) => {
        // Override fetch to use the correct backend URL
        const url = typeof input === 'string' ? input : input.url;
        const fullUrl = url.startsWith('http') ? url : `http://localhost:3456${url}`;
        return fetch(fullUrl, init);
      },
    });
  }, [model, currentChat?.session_id, cloudModels]);

  const { sendMessage, messages, setMessages, stop, isLoading, error, append } = useChat({
    id: currentChat?.session_id, // use the provided chat ID
    transport,
    initialMessages: currentChat?.messages || [],
    onFinish: (message) => {
      console.log('Message finished:', message);
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  // Update messages when current chat changes
  useEffect(() => {
    if (currentChat?.messages) {
      setMessages(currentChat.messages);
    }
  }, [currentChat?.session_id, currentChat?.messages, setMessages]);

  // Log messages updates
  useEffect(() => {
    console.log('All messages in ChatPage:', messages);
    console.log('Messages length:', messages.length);
    console.log('isLoading:', isLoading);
    console.log('error:', error);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      console.log('Last message:', {
        role: lastMessage.role,
        content: lastMessage.content,
        toolInvocations: lastMessage.toolInvocations,
      });
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
    </div>
  );
}
