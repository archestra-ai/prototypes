import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useState } from 'react';

import { useChatProvider } from '@ui/hooks/use-chat-provider';
import { useChatStore } from '@ui/stores/chat-store';

import ChatHistory from './ChatHistory';
import ChatInput from './ChatInput';
import SystemPrompt from './SystemPrompt';

interface ChatPageProps {}

export default function ChatPage(_props: ChatPageProps) {
  const { getCurrentChat, createNewChat, selectedAIModel, isLoadingChats } = useChatStore();
  const currentChat = getCurrentChat();
  const [localInput, setLocalInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

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

  // Always use selectedAIModel from centralized config
  const model = selectedAIModel || '';

  const { stop, isLoading } = useChatProvider({
    model,
    sessionId: currentChat?.session_id,
    initialMessages: currentChat?.messages || [],
  });

  const { sendMessage, messages, setMessages } = useChat({
    id: currentChat?.session_id, // use the provided chat ID
    onData: (dataPart) => {
      // Handle all data parts as they arrive (including transient parts)
      console.log('Received data part:', dataPart);
    },
    onFinish: (message) => {
      console.log('Message finished:', message);
      if (message.toolInvocations && message.toolInvocations.length > 0) {
        console.log('🔧 Tool invocations:', message.toolInvocations);
        message.toolInvocations.forEach((tool, index) => {
          console.log(`  Tool ${index + 1}: ${tool.toolName}`);
          console.log(`    Args:`, tool.args);
          console.log(`    Result:`, tool.result);
        });
      }
    },
    messages: currentChat?.messages,
    transport: new DefaultChatTransport({
      api: '/api/llm/stream',
      body: {
        sessionId: currentChat?.session_id,
      },
    }),
  });

  // Update messages when current chat changes
  useEffect(() => {
    if (currentChat?.messages) {
      setMessages(currentChat.messages);
    }
  }, [currentChat?.session_id, currentChat?.messages, setMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInput(e.target.value);
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (localInput.trim()) {
      console.log('Sending message:', localInput);
      // sendMessage({ parts: [{ type: 'text', text: localInput }] });
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
