import { Brain, Loader2, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatMessage } from '@/components/chat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatContext } from '@/providers/chat-provider';
import { useAgentStore } from '@/stores/agent-store';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  // Use the shared chat context
  const chat = useChatContext();
  const { messages, status, error } = chat;

  const isLoading = status === 'streaming' || status === 'submitted';

  // Debug logging
  useEffect(() => {
    console.log('[ChatHistory] Messages:', messages.length, 'Status:', status);
  }, [messages.length, status]);

  const { mode: agentMode, currentObjective, reasoningMode } = useAgentStore();
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
    const scrollArea = document.querySelector(CHAT_SCROLL_AREA_SELECTOR);
    if (scrollArea) {
      scrollAreaRef.current = scrollArea as HTMLElement;
      scrollArea.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        scrollArea.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Scroll to bottom when messages change (if auto-scroll is enabled)
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, scrollToBottom]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Get the last message for streaming indicator
  const lastMessage = messages[messages.length - 1];
  const isLastMessageStreaming = isLoading && lastMessage?.role === 'assistant';

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full border rounded-lg">
      <div className="px-6 py-4">
        {/* Connection Status */}
        {error && (
          <div className="mb-2 flex items-center gap-2 text-xs text-red-600">
            <WifiOff className="h-3 w-3" /> Connection error: {error.message}
          </div>
        )}

        {/* Agent Mode Indicator */}
        {agentMode !== 'idle' && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <Brain className="h-3 w-3" />
            <span className="capitalize">{agentMode}</span>
          </div>
        )}

        {/* Current Objective */}
        {currentObjective && agentMode !== 'idle' && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-start gap-2">
              <Brain className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Current Objective</p>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{currentObjective}</p>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No messages yet. Start a conversation!</div>
          ) : (
            messages.map((message, index) => {
              console.log(`[ChatHistory] Rendering message ${index}:`, message);
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  showReasoning={reasoningMode === 'verbose'}
                  isStreaming={isLastMessageStreaming && index === messages.length - 1}
                />
              );
            })
          )}
        </div>

        {/* Loading indicator when no messages are streaming yet */}
        {isLoading && (!lastMessage || lastMessage.role !== 'assistant') && (
          <div className="flex items-center gap-2 p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
