import type { UIMessage } from 'ai';
import { Bot, User } from 'lucide-react';

import { cn } from '@/lib/utils/tailwind';

import { MessageContent } from './MessageContent';

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div className={cn('flex gap-3 p-4 rounded-lg', isUser && 'bg-muted/50', isAssistant && 'bg-background')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser && 'bg-primary text-primary-foreground',
          isAssistant && 'bg-secondary text-secondary-foreground'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <MessageContent message={message} />

        {/* Streaming indicator */}
        {isStreaming && isAssistant && (
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-75" />
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>
    </div>
  );
}
