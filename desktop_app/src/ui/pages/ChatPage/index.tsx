import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useState } from 'react';

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

  console.log('Current chat session ID:', currentChat?.session_id);
  console.log('Selected AI Model:', model);

  const { sendMessage, messages, setMessages, stop, isLoading, error } = useChat({
    id: currentChat?.session_id, // use the provided chat ID
    transport: new DefaultChatTransport({
      api: '/api/llm/stream',
      body: {
        provider: 'openai', // Using OpenAI for now
        model: model || 'gpt-4o',
        sessionId: currentChat?.session_id,
      },
      fetch: async (input, init) => {
        // Override fetch to use the correct backend URL
        const url = typeof input === 'string' ? input : input.url;
        const fullUrl = url.startsWith('http') ? url : `http://localhost:3456${url}`;
        return fetch(fullUrl, init);
      },
    }),
    onError: (error) => {
      console.error('useChat error:', error);
    },
    onFinish: (message) => {
      console.log('Message finished:', message);
      console.log('Full message object:', JSON.stringify(message, null, 2));
      
      // Check for dynamic tool invocations
      if (message.toolInvocations && message.toolInvocations.length > 0) {
        console.log('🔧 Tool invocations found:', message.toolInvocations);
        message.toolInvocations.forEach((tool, index) => {
          console.log(`  Tool ${index + 1}: ${tool.toolName}`);
          console.log(`    Args:`, tool.args);
          console.log(`    Result:`, tool.result);
          console.log(`    State:`, tool.state);
        });
      } else {
        console.log('No tool invocations in message');
      }
    },
  });

  // Log any errors
  useEffect(() => {
    if (error) {
      console.error('Chat error state:', error);
    }
  }, [error]);

  // Update messages when current chat changes
  useEffect(() => {
    if (currentChat?.messages) {
      setMessages(currentChat.messages);
    }
  }, [currentChat?.session_id, currentChat?.messages, setMessages]);

  // Log messages updates
  useEffect(() => {
    console.log('Current messages in chat:', messages);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      console.log('Last message:', {
        role: lastMessage.role,
        content: lastMessage.content,
        toolInvocations: lastMessage.toolInvocations,
      });
    }
  }, [messages]);

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
