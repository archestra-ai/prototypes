import { Brain, Loader2, Wifi, WifiOff } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  MemoizedAgentModeIndicator,
  MemoizedChatMessage,
  MemoizedPlanSteps,
  MemoizedReasoningDisplay,
  MemoizedTaskProgressDisplay,
  useThrottledValue,
} from '@/components/agent/performance-optimizations';
import { AIResponse } from '@/components/kibo/ai-response';
import { ToolParts } from '@/components/kibo/tool-part';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSSEChat } from '@/hooks/use-sse-chat';
import { useAgentStore } from '@/stores/agent-store';
import { ReasoningDataPart, TaskProgressDataPart } from '@/types/agent';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  // Use the new SSE chat hook
  const { messages, status, error } = useSSEChat({
    onError: (error) => {
      console.error('[ChatHistory] SSE error:', error);
    },
    onFinish: ({ message }) => {
      console.log('[ChatHistory] Message finished:', { message });
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const { mode: agentMode, plan, reasoningMode, currentObjective } = useAgentStore();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Throttle plan updates to prevent excessive re-renders
  const throttledPlan = useThrottledValue(plan, 100);

  // Memoize helper functions to prevent recreating them on every render
  const formatAgentMode = useCallback((mode: string) => {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }, []);

  const getAgentModeColor = useCallback((mode: string) => {
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
  }, []);

  // Memoized helper function to render data parts
  const renderDataPart = useCallback((data: any, index: number): React.ReactNode => {
    if (data.type === 'reasoning') {
      return null; // Handled in renderAssistantMessage
    }

    if (data.type === 'task-progress') {
      return null; // Handled in renderAssistantMessage
    }

    // Generic data part rendering
    return (
      <div key={index} className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs font-mono">
        {JSON.stringify(data, null, 2)}
      </div>
    );
  }, []);

  // Memoized helper function to render message content
  const renderMessageContent = useCallback(
    (content: any): React.ReactNode => {
      if (typeof content === 'string') {
        return content;
      }

      if (Array.isArray(content)) {
        return content.map((part, index) => {
          if (typeof part === 'string') {
            return <span key={index}>{part}</span>;
          }

          if (part.type === 'text') {
            return <span key={index}>{part.text}</span>;
          }

          if (part.type === 'data') {
            return renderDataPart(part.data, index);
          }

          return null;
        });
      }

      return JSON.stringify(content);
    },
    [renderDataPart]
  );

  // Memoized helper function to render assistant messages with tool calls and data parts
  const renderAssistantMessage = useCallback(
    (msg: any, messageIndex: number): React.ReactNode => {
      // Handle v5 UIMessage format with parts
      const parts: React.ReactNode[] = [];
      let textContent = '';
      let reasoningParts: ReasoningDataPart[] = [];
      let taskProgressParts: TaskProgressDataPart[] = [];
      let toolCalls: any[] = [];

      // Extract content and data parts from v5 message format
      if (msg.parts && Array.isArray(msg.parts)) {
        // Handle v5 message parts
        msg.parts.forEach((part: any) => {
          if (part.type === 'text') {
            textContent += part.text || '';
          } else if (part.type === 'reasoning') {
            reasoningParts.push({
              type: 'data',
              data: {
                type: 'reasoning',
                entry: {
                  id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                  type: 'planning' as const,
                  content: part.text || '',
                  alternatives: [],
                  timestamp: new Date(),
                  confidence: 0.8,
                },
              },
            });
          } else if (part.type === 'tool-call') {
            toolCalls.push({
              id: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
              state: 'call',
            });
          } else if (part.type === 'tool-result') {
            // Find and update the corresponding tool call
            const toolCallIndex = toolCalls.findIndex((tc) => tc.id === part.toolCallId);
            if (toolCallIndex >= 0) {
              toolCalls[toolCallIndex] = {
                ...toolCalls[toolCallIndex],
                state: 'result',
                result: part.result,
              };
            }
          }
        });
      } else if (typeof msg.content === 'string') {
        // Fallback for simple string content
        textContent = msg.content;
      } else {
        // Handle current ChatMessage format
        textContent = msg.content || '';

        // Kept for backward compatibility with old format
      }

      // Extract tool calls from message
      if (msg.toolInvocations) {
        toolCalls = [...toolCalls, ...msg.toolInvocations];
      }

      // Render tool calls using the new ToolParts component
      if (msg.parts && msg.parts.some((p: any) => p.type === 'tool-call' || p.type === 'tool-result')) {
        parts.push(<ToolParts key="tool-parts" parts={msg.parts} />);
      }

      // Render reasoning if available
      if (reasoningMode === 'verbose') {
        parts.push(
          <MemoizedReasoningDisplay
            key="reasoning"
            reasoningParts={reasoningParts}
            isThinking={false}
            thinkingContent={undefined}
          />
        );
      }

      // Render main content
      if (textContent) {
        parts.push(<AIResponse key="main-content">{textContent}</AIResponse>);
      }

      // Render task progress
      if (taskProgressParts.length > 0) {
        parts.push(<MemoizedTaskProgressDisplay key="task-progress" taskProgressParts={taskProgressParts} />);
      }

      // Show loading indicator if still streaming
      if ((isLoading && messageIndex === messages.length - 1) || false) {
        parts.push(
          <div key="loading" className="flex items-center space-x-2 mt-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <p className="text-muted-foreground text-sm">{msg.isToolExecuting ? 'Executing tools...' : 'Loading...'}</p>
          </div>
        );
      }

      return <>{parts}</>;
    },
    [reasoningMode, isLoading, messages.length]
  );

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

  // Monitor SSE connection status
  useEffect(() => {
    setConnectionStatus(isLoading ? 'connecting' : error ? 'disconnected' : 'connected');
  }, [isLoading, error]);

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
        {/* SSE Connection Status - will show real status when useChat is enabled */}
        {false && ( // Hide for now until SSE endpoint is ready
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {connectionStatus === 'connected' ? (
              <>
                <Wifi className="h-3 w-3 text-green-600" /> Connected
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Connecting...
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-red-600" /> Disconnected
              </>
            )}
          </div>
        )}
        {/* Agent Mode Indicator */}
        {agentMode !== 'idle' && (
          <MemoizedAgentModeIndicator
            agentMode={agentMode}
            formatAgentMode={formatAgentMode}
            getAgentModeColor={getAgentModeColor}
          />
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
        {throttledPlan?.steps && throttledPlan.steps.length > 0 && agentMode !== 'idle' && (
          <MemoizedPlanSteps steps={throttledPlan.steps} />
        )}

        {/* Chat Messages with v5 Message Part Support */}
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <MemoizedChatMessage
              key={msg.id || `msg-${index}`}
              message={msg}
              index={index}
              reasoningMode={reasoningMode}
              isLoading={isLoading}
              renderMessageContent={renderMessageContent}
              renderAssistantMessage={renderAssistantMessage}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
