import { useCallback, useEffect, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/tailwind';
import { useChatContext } from '@/providers/chat-provider';
import { ChatInteraction } from '@/types';

import { AssistantInteraction, OtherInteraction, ToolInteraction, UserInteraction } from './Interactions';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

interface InteractionProps {
  interaction: ChatInteraction;
}

const Interaction = ({ interaction }: InteractionProps) => {
  switch (interaction.role) {
    case 'user':
      return <UserInteraction interaction={interaction} />;
    case 'assistant':
      return <AssistantInteraction interaction={interaction} />;
    case 'tool':
      return <ToolInteraction interaction={interaction} />;
    default:
      return <OtherInteraction interaction={interaction} />;
  }
};

const getInteractionClassName = (interaction: ChatInteraction) => {
  switch (interaction.role) {
    case 'user':
      return 'bg-primary/10 border border-primary/20 ml-8';
    case 'assistant':
      return 'bg-secondary/50 border border-secondary mr-8';
    // NOTE: we can probably delete this.. this isn't a real role returned by ollama?
    // case ChatInteractionRole.Error:
    //   return 'bg-destructive/10 border border-destructive/20 text-destructive';
    case 'system':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600';
    case 'tool':
      return 'bg-blue-500/10 border border-blue-500/20 text-blue-600';
    default:
      return 'bg-muted border';
  }
};

export default function ChatHistory(_props: ChatHistoryProps) {
  const { messages } = useChatContext();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug logging
  useEffect(() => {
    console.log('[ChatHistory] Messages:', messages);
    console.log('[ChatHistory] Messages length:', messages.length);
    if (messages.length > 0) {
      console.log('[ChatHistory] First message:', messages[0]);
    }
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
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full border rounded-lg">
      <div className="p-4 space-y-4">
        {messages.map((message) => {
          // Convert UIMessage to ChatInteraction format
          const interaction: ChatInteraction = {
            id: message.id,
            role: message.role,
            content: message.parts.find((part) => part.type === 'text')?.text || '',
            thinking: '',
            toolCalls: [],
            images: [],
            thinkingContent: '',
            isStreaming: false,
            isThinkingStreaming: false,
            isToolExecuting: false,
            created_at: new Date().toISOString(),
          };

          return (
            <div key={message.id} className={cn('p-3 rounded-lg', getInteractionClassName(interaction))}>
              <div className="text-xs font-medium mb-1 opacity-70 capitalize">{message.role}</div>
              <Interaction interaction={interaction} />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
