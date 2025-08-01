import { useEffect } from 'react';

import { ChatProvider } from '@/providers/chat-provider';
import { useChatStore } from '@/stores/chat-store';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { loadChats } = useChatStore();

  // Load chats when component mounts
  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  return (
    <ChatProvider>
      <div className="flex flex-col h-full gap-2 max-w-full overflow-hidden p-4">
        <div className="flex-1 min-h-0 overflow-hidden max-w-full">
          <ChatHistory />
        </div>

        <SystemPrompt />
        <div className="flex-shrink-0">
          <ChatInput />
        </div>
      </div>
    </ChatProvider>
  );
}
