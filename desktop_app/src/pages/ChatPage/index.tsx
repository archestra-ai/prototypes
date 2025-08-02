import { useEffect, useState } from 'react';

import { ProviderSelector } from '@/components/ProviderSelector';
import { useChatProvider } from '@/hooks/use-chat-provider';
import { useChatStore } from '@/stores/chat-store';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { getCurrentChat, createNewChat, selectedAIModel } = useChatStore();
  const currentChat = getCurrentChat();
  const [localInput, setLocalInput] = useState('');

  // Ensure we have a chat session
  useEffect(() => {
    if (!currentChat) {
      createNewChat();
    }
  }, [currentChat, createNewChat]);

  // Always use selectedAIModel from centralized config
  const model = selectedAIModel || '';

  const { messages, sendMessage, stop, isLoading } = useChatProvider({
    model,
    sessionId: currentChat?.session_id,
    initialMessages: currentChat?.messages || [],
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInput(e.target.value);
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (localInput.trim()) {
      sendMessage(localInput);
      setLocalInput('');
    }
  };

  return (
    <div className="flex flex-col h-full gap-2 max-w-full overflow-hidden">
      <div className="flex justify-end px-4 py-2">
        <ProviderSelector />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden max-w-full">
        <ChatHistory messages={messages as any} />
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
