import { useCallback, useEffect, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/tailwind';
import { useChatStore } from '@/stores/chat-store';

import { AssistantInteraction, OtherInteraction, ToolInteraction, UserInteraction } from './Interactions';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

// TODO: update this type...
const Interaction = ({ interaction }: { interaction: any }) => {
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

const getInteractionClassName = (interaction: any) => {
  switch (interaction.role) {
    case 'user':
      return 'bg-primary/10 border border-primary/20 ml-8';
    case 'assistant':
      return 'bg-secondary/50 border border-secondary mr-8';
    case 'error':
      return 'bg-destructive/10 border border-destructive/20 text-destructive';
    case 'system':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600';
    case 'tool':
      return 'bg-blue-500/10 border border-blue-500/20 text-blue-600';
    default:
      return 'bg-muted border';
  }
};

export default function ChatHistory(_props: ChatHistoryProps) {
  const { currentChat } = useChatStore();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Trigger scroll when chat changes (only if shouldAutoScroll is true)
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [currentChat, scrollToBottom]);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full">
      <div className="space-y-4 p-4">
        {/* TODO: update this type... */}
        {currentChat?.interactions.map((interaction: any, index) => (
          <div key={interaction.id || index} className={cn('p-3 rounded-lg', getInteractionClassName(interaction))}>
            <div className="text-xs font-medium mb-1 opacity-70 capitalize">{interaction.role}</div>
            <Interaction interaction={interaction} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
