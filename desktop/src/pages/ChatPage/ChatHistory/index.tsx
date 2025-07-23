import { Wrench } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat-store';

import ToolCallIndicator from '../ToolCallIndicator';
import ToolExecutionResult from '../ToolExecutionResult';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  const { chatHistory } = useChatStore();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Scroll to bottom when new messages are added or content changes
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current && shouldAutoScroll && !isScrollingRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'instant', // Changed from 'smooth' to prevent conflicts
      });
    }
  }, [shouldAutoScroll]);

  const checkIfAtBottom = useCallback(() => {
    if (!scrollAreaRef.current) return false;

    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    // Consider "at bottom" if within 10px of the bottom (tighter threshold)
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
      scrollArea.addEventListener('scroll', handleScroll);

      return () => {
        scrollArea.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Trigger scroll when chat history changes (only if shouldAutoScroll is true)
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [chatHistory, scrollToBottom]);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full">
      <div className="space-y-4 p-4">
        {chatHistory.map((msg, index) => (
          <div
            key={msg.id || index}
            className={cn(
              'p-3 rounded-lg',
              msg.role === 'user'
                ? 'bg-primary/10 border border-primary/20 ml-8'
                : msg.role === 'assistant'
                  ? 'bg-secondary/50 border border-secondary mr-8'
                  : msg.role === 'error'
                    ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                    : msg.role === 'system'
                      ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600'
                      : msg.role === 'tool'
                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-600'
                        : 'bg-muted border'
            )}
          >
            <div className="text-xs font-medium mb-1 opacity-70 capitalize">{msg.role}</div>
            {msg.role === 'user' ? (
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            ) : msg.role === 'assistant' ? (
              <div className="relative">
                {(msg.isToolExecuting || msg.toolCalls) && (
                  <ToolCallIndicator toolCalls={msg.toolCalls || []} isExecuting={!!msg.isToolExecuting} />
                )}

                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {msg.toolCalls.map((toolCall) => (
                      <ToolExecutionResult
                        key={toolCall.id}
                        serverName={toolCall.serverName}
                        toolName={toolCall.toolName}
                        arguments={toolCall.arguments}
                        result={toolCall.result || ''}
                        executionTime={toolCall.executionTime}
                        status={toolCall.error ? 'error' : 'success'}
                        error={toolCall.error}
                      />
                    ))}
                  </div>
                )}

                {msg.thinkingContent && (
                  <AIReasoning isStreaming={msg.isThinkingStreaming} className="mb-4">
                    <AIReasoningTrigger />
                    <AIReasoningContent>{msg.thinkingContent}</AIReasoningContent>
                  </AIReasoning>
                )}

                <AIResponse>{msg.content}</AIResponse>

                {(msg.isStreaming || msg.isToolExecuting) && (
                  <div className="flex items-center space-x-2 mt-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground text-sm">
                      {msg.isToolExecuting ? 'Executing tools...' : 'Loading...'}
                    </p>
                  </div>
                )}
              </div>
            ) : msg.role === 'tool' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Tool Result</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-sm whitespace-pre-wrap font-mono">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
