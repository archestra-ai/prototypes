import { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ScrollArea } from '@ui/components/ui/scroll-area';
import { cn } from '@ui/lib/utils/tailwind';

import { AssistantMessage, OtherMessage, ToolMessage, UserMessage } from './Messages';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {
  messages: UIMessage[];
}

interface MessageProps {
  message: UIMessage;
}

const Message = ({ message }: MessageProps) => {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message} />;
    case 'assistant':
      return <AssistantMessage message={message} />;
    case 'system':
      return <OtherMessage message={message} />;
    default:
      return <OtherMessage message={message} />;
  }
};

const getMessageClassName = (message: UIMessage) => {
  switch (message.role) {
    case 'user':
      return 'bg-primary/10 border border-primary/20 ml-8';
    case 'assistant':
      return 'bg-secondary/50 border border-secondary mr-8';
    case 'system':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600';
    default:
      return 'bg-muted border';
  }
};

export default function ChatHistory({ messages }: ChatHistoryProps) {
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug messages
  useEffect(() => {
    console.log('ChatHistory received messages:', messages);
    messages.forEach((msg, idx) => {
      console.log(`Message ${idx}:`, {
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
      });
    });
  }, [messages]);

  // Scroll to bottom when new messages are added or content changes
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current && shouldAutoScroll && !isScrollingRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [shouldAutoScroll]);

  const checkIfAtBottom = useCallback(() => {
    if (!scrollAreaRef.current) {
      return false;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;

    // Consider "at bottom" to be within 10px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    return isAtBottom;
  }, []);

  const handleScroll = useCallback(() => {
    // Mark that user is scrolling
    isScrollingRef.current = true;

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce the scroll end detection
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      const isAtBottom = checkIfAtBottom();
      setShouldAutoScroll(isAtBottom);
    }, 150); // 150ms debounce
  }, [checkIfAtBottom]);

  // Set up scroll area ref and scroll listener
  useEffect(() => {
    const scrollArea = document.querySelector(CHAT_SCROLL_AREA_SELECTOR) as HTMLElement;
    if (scrollArea) {
      scrollAreaRef.current = scrollArea;
      scrollArea.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        scrollArea.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Trigger scroll when messages change (only if shouldAutoScroll is true)
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, scrollToBottom]);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full border rounded-lg overflow-hidden">
      <div className="p-4 space-y-4 max-w-full overflow-hidden">
        {messages.map((message) => (
          <div key={message.id} className={cn('p-3 rounded-lg overflow-hidden min-w-0', getMessageClassName(message))}>
            <div className="text-xs font-medium mb-1 opacity-70 capitalize">{message.role}</div>
            <div className="overflow-hidden min-w-0">
              <Message message={message} />
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
