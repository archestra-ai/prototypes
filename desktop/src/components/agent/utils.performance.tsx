import { Bot, CheckCircle, Loader2 } from 'lucide-react';
import React, { memo } from 'react';

import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { cn } from '@/lib/utils/tailwind';
import ToolCallIndicator from '@/pages/ChatPage/ChatHistory/Interactions/ToolCallIndicator';
import { ReasoningDataPart, TaskProgressDataPart } from '@/types/agent';

/**
 * Performance-optimized message rendering components using React.memo
 * These components prevent unnecessary re-renders when parent components update
 */

// Memoized component for rendering individual chat messages
export const MemoizedChatMessage = memo(
  ({
    message,
    index,
    renderMessageContent,
    renderAssistantMessage,
  }: {
    message: any;
    index: number;
    reasoningMode: string;
    isLoading: boolean;
    renderMessageContent: (content: any) => React.ReactNode;
    renderAssistantMessage: (msg: any, messageIndex: number) => React.ReactNode;
  }) => {
    return (
      <div
        className={cn(
          'p-3 rounded-lg',
          message.role === 'user'
            ? 'bg-primary/10 border border-primary/20 ml-8'
            : message.role === 'assistant'
              ? 'bg-secondary/50 border border-secondary mr-8'
              : 'bg-muted border'
        )}
      >
        <div className="text-xs font-medium mb-1 opacity-70 capitalize">{message.role}</div>

        {message.role === 'user' ? (
          <div className="text-sm whitespace-pre-wrap">{renderMessageContent(message.content)}</div>
        ) : message.role === 'assistant' ? (
          <div className="relative">{renderAssistantMessage(message, index)}</div>
        ) : (
          <div className="text-sm whitespace-pre-wrap">{renderMessageContent(message.content)}</div>
        )}
      </div>
    );
  },
  // Custom comparison function to prevent re-renders unless message content changes
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.isStreaming === nextProps.message.isStreaming &&
      prevProps.message.isToolExecuting === nextProps.message.isToolExecuting &&
      prevProps.reasoningMode === nextProps.reasoningMode &&
      prevProps.isLoading === nextProps.isLoading
    );
  }
);

MemoizedChatMessage.displayName = 'MemoizedChatMessage';

// Memoized component for rendering agent mode indicator
export const MemoizedAgentModeIndicator = memo(
  ({
    agentMode,
    formatAgentMode,
    getAgentModeColor,
  }: {
    agentMode: string;
    formatAgentMode: (mode: string) => string;
    getAgentModeColor: (mode: string) => string;
  }) => {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent/50 px-4 py-3">
        <Bot className={cn('h-4 w-4', getAgentModeColor(agentMode))} />
        <span className="text-sm font-medium">
          Agent Mode: <span className={getAgentModeColor(agentMode)}>{formatAgentMode(agentMode)}</span>
        </span>
        {agentMode === 'executing' && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
        {agentMode === 'completed' && <CheckCircle className="ml-auto h-4 w-4 text-green-600" />}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.agentMode === nextProps.agentMode
);

MemoizedAgentModeIndicator.displayName = 'MemoizedAgentModeIndicator';

// Memoized component for rendering reasoning data
export const MemoizedReasoningDisplay = memo(
  ({
    reasoningParts,
    isThinking,
    thinkingContent,
  }: {
    reasoningParts: ReasoningDataPart[];
    isThinking?: boolean;
    thinkingContent?: string;
  }) => {
    return (
      <>
        {reasoningParts.length > 0 ? (
          reasoningParts.map((reasoning, index) => (
            <AIReasoning key={`reasoning-${index}`} className="mb-4">
              <AIReasoningTrigger />
              <AIReasoningContent>{reasoning.data.entry.content}</AIReasoningContent>
            </AIReasoning>
          ))
        ) : isThinking && thinkingContent ? (
          <AIReasoning key="thinking" isStreaming={isThinking} className="mb-4">
            <AIReasoningTrigger />
            <AIReasoningContent>{thinkingContent}</AIReasoningContent>
          </AIReasoning>
        ) : null}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.reasoningParts.length === nextProps.reasoningParts.length &&
      prevProps.isThinking === nextProps.isThinking &&
      prevProps.thinkingContent === nextProps.thinkingContent &&
      // Deep compare reasoning parts
      prevProps.reasoningParts.every(
        (part, index) => part.data.entry.id === nextProps.reasoningParts[index]?.data.entry.id
      )
    );
  }
);

MemoizedReasoningDisplay.displayName = 'MemoizedReasoningDisplay';

// Memoized component for tool call indicators
export const MemoizedToolCallDisplay = memo(
  ({ toolCallInfos, isExecuting }: { toolCallInfos: any[]; isExecuting: boolean }) => {
    return <ToolCallIndicator toolCalls={toolCallInfos} isExecuting={isExecuting} />;
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isExecuting === nextProps.isExecuting &&
      prevProps.toolCallInfos.length === nextProps.toolCallInfos.length &&
      prevProps.toolCallInfos.every((tc, index) => tc.id === nextProps.toolCallInfos[index]?.id)
    );
  }
);

MemoizedToolCallDisplay.displayName = 'MemoizedToolCallDisplay';

// Memoized component for task progress display
export const MemoizedTaskProgressDisplay = memo(
  ({ taskProgressParts }: { taskProgressParts: TaskProgressDataPart[] }) => {
    if (taskProgressParts.length === 0) return null;

    const latestProgress = taskProgressParts[taskProgressParts.length - 1];
    return (
      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
        <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
          Task Progress: {latestProgress.data.progress.completed}/{latestProgress.data.progress.total}
        </div>
        {latestProgress.data.progress.currentStep && (
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {latestProgress.data.progress.currentStep}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    const prevLatest = prevProps.taskProgressParts[prevProps.taskProgressParts.length - 1];
    const nextLatest = nextProps.taskProgressParts[nextProps.taskProgressParts.length - 1];

    if (!prevLatest || !nextLatest) return prevLatest === nextLatest;

    return (
      prevLatest.data.progress.completed === nextLatest.data.progress.completed &&
      prevLatest.data.progress.total === nextLatest.data.progress.total &&
      prevLatest.data.progress.currentStep === nextLatest.data.progress.currentStep
    );
  }
);

MemoizedTaskProgressDisplay.displayName = 'MemoizedTaskProgressDisplay';

// Memoized plan steps display
export const MemoizedPlanSteps = memo(
  ({ steps }: { steps: Array<{ status: string; description: string }> }) => {
    return (
      <div className="mb-4 space-y-2">
        {steps.map((step, index) => (
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
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.steps.length === nextProps.steps.length &&
      prevProps.steps.every(
        (step, index) =>
          step.status === nextProps.steps[index]?.status && step.description === nextProps.steps[index]?.description
      )
    );
  }
);

MemoizedPlanSteps.displayName = 'MemoizedPlanSteps';

// Utility hook for throttling updates to prevent excessive re-renders
export function useThrottledValue<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastUpdate = React.useRef(Date.now());

  React.useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdate.current;

    if (timeSinceLastUpdate >= delay) {
      setThrottledValue(value);
      lastUpdate.current = now;
    } else {
      const timeoutId = setTimeout(() => {
        setThrottledValue(value);
        lastUpdate.current = Date.now();
      }, delay - timeSinceLastUpdate);

      return () => clearTimeout(timeoutId);
    }
  }, [value, delay]);

  return throttledValue;
}

// Performance monitoring utility
export function usePerformanceMonitor(componentName: string) {
  const renderCount = React.useRef(0);
  const lastRenderTime = React.useRef(Date.now());

  React.useEffect(() => {
    renderCount.current++;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    lastRenderTime.current = now;

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Performance] ${componentName} rendered (count: ${renderCount.current}, time since last: ${timeSinceLastRender}ms)`
      );
    }
  });
}
