import { Bot, Brain, CheckCircle, Loader2, Wrench } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';

import ToolCallIndicator from '../ToolCallIndicator';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  const { chatHistory } = useChatStore();
  const { mode: agentMode, plan, reasoningMode, currentObjective } = useAgentStore();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Helper function to format agent mode
  const formatAgentMode = (mode: string) => {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  // Helper function to get agent mode color
  const getAgentModeColor = (mode: string) => {
    switch (mode) {
      case 'initializing':
        return 'text-yellow-600';
      case 'planning':
        return 'text-blue-600';
      case 'executing':
        return 'text-green-600';
      case 'paused':
        return 'text-orange-600';
      case 'completed':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

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

  // Scroll to bottom when chat history changes (if auto-scroll is enabled)
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [chatHistory, scrollToBottom]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full">
      <div className="px-6 py-4">
        {/* Agent Mode Indicator */}
        {agentMode !== 'idle' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent/50 px-4 py-3">
            <Bot className={cn('h-4 w-4', getAgentModeColor(agentMode))} />
            <span className="text-sm font-medium">
              Agent Mode: <span className={getAgentModeColor(agentMode)}>{formatAgentMode(agentMode)}</span>
            </span>
            {agentMode === 'executing' && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            {agentMode === 'completed' && <CheckCircle className="ml-auto h-4 w-4 text-green-600" />}
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

        {/* Progress Indicators */}
        {plan?.steps && plan.steps.length > 0 && agentMode !== 'idle' && (
          <div className="mb-4 space-y-2">
            {plan.steps.map((step, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                  step.status === 'completed' && 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
                  step.status === 'in_progress' && 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                  step.status === 'pending' && 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400'
                )}
              >
                {step.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                {step.status === 'in_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
                {step.status === 'pending' && <div className="h-3 w-3 rounded-full border-2 border-current" />}
                <span>{step.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Chat Messages */}
        <div className="space-y-4">
          {chatHistory.map((msg, index) => (
            <div
              key={`${msg.id || 'msg'}-${index}`}
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

                  {/* Show thinking/reasoning content - prioritize agent reasoning over regular thinking */}
                  {reasoningMode === 'verbose' && msg.agentMetadata?.reasoning ? (
                    <AIReasoning className="mb-4">
                      <AIReasoningTrigger />
                      <AIReasoningContent>{msg.agentMetadata.reasoning.content}</AIReasoningContent>
                    </AIReasoning>
                  ) : msg.thinkingContent ? (
                    <AIReasoning isStreaming={msg.isThinkingStreaming} className="mb-4">
                      <AIReasoningTrigger />
                      <AIReasoningContent>{msg.thinkingContent}</AIReasoningContent>
                    </AIReasoning>
                  ) : null}

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
      </div>
    </ScrollArea>
  );
}
