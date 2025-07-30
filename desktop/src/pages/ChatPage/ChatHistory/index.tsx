import { useMemo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/tailwind';
import { useChatContext } from '@/providers/chat-provider';
import { ChatMessage, ToolCallStatus } from '@/types';

import { AssistantMessage, OtherMessage, UserMessage } from './Messages';
import ToolExecutionResult from './Messages/ToolExecutionResult';
import { useAutoScroll } from './hooks/use-auto-scroll';
import { processMessages } from './utils/message-processing';
import { getMessageClassName } from './utils/message-styles';

interface ChatHistoryProps {}

interface MessageProps {
  message: ChatMessage;
}

const Message = ({ message }: MessageProps) => {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message} />;
    case 'assistant':
      return <AssistantMessage message={message} />;
    case 'tool':
      // Tool messages should have toolCalls array with the tool execution details
      if (message.toolCalls && message.toolCalls.length > 0) {
        return (
          <div className="space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolExecutionResult key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        );
      }
      // Fallback for tool messages without proper structure
      return <OtherMessage message={message} />;
    default:
      return <OtherMessage message={message} />;
  }
};

export default function ChatHistory(_props: ChatHistoryProps) {
  const { messages, status } = useChatContext();
  const isStreaming = status === 'streaming';

  // Auto-scroll hook
  const { scrollAreaId } = useAutoScroll([messages]);

  // Process messages to split tool calls into separate entries
  const processedMessages = useMemo(() => {
    return processMessages(messages, isStreaming);
  }, [messages, isStreaming]);

  return (
    <ScrollArea id={scrollAreaId} className="h-full w-full border rounded-lg overflow-hidden">
      <div className="p-4 space-y-4 max-w-full overflow-hidden">
        {processedMessages.map((message, index) => {
          // Check if this is the last message and we're streaming
          const isLastMessage = index === processedMessages.length - 1;
          const isMessageStreaming = isLastMessage && isStreaming && message.role === 'assistant';

          // Convert processed message to ChatMessage format
          const chatMessage: ChatMessage = {
            id: message.id,
            role: message.role as any,
            content: message.content || '',

            toolCalls: message.toolCalls || [],

            thinkingContent: message.thinking || '',
            isStreaming: isMessageStreaming && !message.thinking && !message.isToolOnly,
            isThinkingStreaming: isMessageStreaming && !!message.thinking,
            isToolExecuting:
              isMessageStreaming && (message.toolCalls?.some((tc) => tc.status === ToolCallStatus.Executing) || false),
          };

          return (
            <div
              key={message.id}
              className={cn('p-3 rounded-lg overflow-hidden min-w-0', getMessageClassName(chatMessage))}
            >
              <div className="text-xs font-medium mb-1 opacity-70 capitalize">{message.role}</div>
              <div className="overflow-hidden min-w-0">
                <Message message={chatMessage} />
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
