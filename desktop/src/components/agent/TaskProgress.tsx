import { Activity, CheckCircle2, Circle, Clock, ListChecks, Loader2, XCircle } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/tailwind';
import { useAgentStore } from '@/stores/agent-store';
import { TaskProgressDataPart, TaskProgress as TaskProgressType, TaskStep } from '@/types/agent';

interface TaskProgressProps {
  className?: string;
  compact?: boolean;
  // Optional: v5 streaming task progress updates
  streamingProgress?: TaskProgressDataPart[];
  // Optional: callback when step completes (for v5 onStepFinish)
  onStepComplete?: (stepId: string, result: any) => void;
  // Optional: enable real-time updates
  enableRealtimeUpdates?: boolean;
}

// Selector functions defined outside component to prevent recreation
const selectPlan = (state: any) => state.plan;
const selectProgress = (state: any) => state.progress;
const selectMode = (state: any) => state.mode;
const selectCurrentTask = (state: any) => state.currentTask;

export const TaskProgress = React.memo(function TaskProgressInner({
  className,
  compact = false,
  streamingProgress,
  onStepComplete,
  enableRealtimeUpdates = false,
}: TaskProgressProps) {
  const plan = useAgentStore(selectPlan);
  const storeProgress = useAgentStore(selectProgress);
  const mode = useAgentStore(selectMode);
  const currentTask = useAgentStore(selectCurrentTask);

  const [realtimeSteps, setRealtimeSteps] = useState<Map<string, number>>(new Map());
  const [animatingSteps, setAnimatingSteps] = useState<Set<string>>(new Set());

  // Merge store progress with streaming progress
  const progress = useMemo(() => {
    if (streamingProgress && streamingProgress.length > 0) {
      // Get the latest progress from streaming data
      const latestProgress = streamingProgress[streamingProgress.length - 1].data.progress;
      return {
        ...storeProgress,
        ...latestProgress,
      };
    }
    return storeProgress;
  }, [storeProgress, streamingProgress]);

  // Track step completion animations
  useEffect(() => {
    if (onStepComplete && plan && plan.steps) {
      plan.steps.forEach((step: TaskStep) => {
        if (step.status === 'completed' && !realtimeSteps.has(step.id)) {
          setRealtimeSteps((prev) => new Map(prev).set(step.id, Date.now()));
          setAnimatingSteps((prev) => new Set(prev).add(step.id));

          // Remove animation after 1 second
          setTimeout(() => {
            setAnimatingSteps((prev) => {
              const next = new Set(prev);
              next.delete(step.id);
              return next;
            });
          }, 1000);

          // Call the v5 callback
          onStepComplete(step.id, step.result);
        }
      });
    }
  }, [plan, onStepComplete, realtimeSteps]);

  // const isActive = mode === 'executing' || mode === 'planning';

  // Calculate progress percentage
  const progressPercent = useMemo(() => {
    if (!progress.total || progress.total === 0) return 0;
    return Math.round((progress.completed / progress.total) * 100);
  }, [progress.completed, progress.total]);

  // Format time remaining
  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return 'Calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  // Get step icon based on status
  const getStepIcon = (step: TaskStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'skipped':
        return <Circle className="h-4 w-4 text-muted-foreground/50" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Get step status text
  const getStepStatusText = (step: TaskStep) => {
    switch (step.status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'failed':
        return `Failed${step.retryCount > 0 ? ` (${step.retryCount}/${step.maxRetries} retries)` : ''}`;
      case 'skipped':
        return 'Skipped';
      default:
        return 'Pending';
    }
  };

  // Early return if agent is not active
  if (mode === 'idle' || !storeProgress) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {progress.completed}/{progress.total} tasks
        </span>
        {progressPercent > 0 && <Progress value={progressPercent} className="h-1.5 w-24" />}
      </div>
    );
  }

  return (
    <Card className={cn('transition-all duration-300', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Task Progress
              {enableRealtimeUpdates && mode === 'executing' && (
                <Activity className="h-4 w-4 text-green-500 animate-pulse" />
              )}
            </CardTitle>
            {plan && <CardDescription className="mt-1">{plan.objective}</CardDescription>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">{progressPercent}%</div>
            <div className="text-xs text-muted-foreground">
              {progress.completed} of {progress.total} tasks
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          {progress.estimatedTimeRemaining && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Est. time remaining: {formatTimeRemaining(progress.estimatedTimeRemaining)}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Current task */}
        {currentTask && (
          <div className="rounded-lg bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Current Task</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{currentTask}</p>
          </div>
        )}

        {/* Task list */}
        {plan && plan.steps && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Tasks</h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {plan.steps.map((step: TaskStep, index: number) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-2 rounded-md p-2 text-sm transition-all duration-300',
                    step.status === 'in_progress' && 'bg-primary/5',
                    step.status === 'completed' && 'opacity-60',
                    step.status === 'failed' && 'bg-destructive/5',
                    animatingSteps.has(step.id) && 'scale-105 bg-green-50 dark:bg-green-950/20'
                  )}
                >
                  <div className="mt-0.5">{getStepIcon(step)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">
                        {index + 1}. {step.description}
                      </p>
                      <span
                        className={cn(
                          'text-xs shrink-0',
                          step.status === 'completed' && 'text-green-600',
                          step.status === 'failed' && 'text-destructive',
                          step.status === 'in_progress' && 'text-primary',
                          step.status === 'pending' && 'text-muted-foreground'
                        )}
                      >
                        {getStepStatusText(step)}
                      </span>
                    </div>
                    {step.result?.error && <p className="mt-1 text-xs text-destructive">{step.result.error}</p>}
                    {step.reasoningText && step.status === 'in_progress' && (
                      <p className="mt-1 text-xs text-muted-foreground">{step.reasoningText}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary stats */}
        {(progress.completed > 0 || mode === 'completed') && (
          <>
            <Separator />
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-semibold text-green-600">{progress.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-primary">
                  {plan?.steps?.filter((s: TaskStep) => s.status === 'in_progress').length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-destructive">
                  {plan?.steps?.filter((s: TaskStep) => s.status === 'failed').length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

// Helper hook to extract task progress from v5 messages
export function useTaskProgressFromMessages(messages: any[]): {
  progress: TaskProgressDataPart[];
  latestProgress: TaskProgressType | null;
} {
  const progress = useMemo(() => {
    const parts: TaskProgressDataPart[] = [];

    messages.forEach((msg) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        msg.content.forEach((part: any) => {
          if (part.type === 'data' && part.data?.type === 'task-progress') {
            parts.push(part as TaskProgressDataPart);
          }
        });
      }
    });

    return parts;
  }, [messages]);

  const latestProgress = useMemo(() => {
    if (progress.length === 0) return null;
    return progress[progress.length - 1].data.progress;
  }, [progress]);

  return { progress, latestProgress };
}

// Helper function to create v5 onStepFinish callback
export function createStepFinishCallback(
  onProgressUpdate?: (progress: TaskProgressType) => void,
  onStepComplete?: (stepId: string, result: any) => void
) {
  return async (step: any) => {
    console.log('📍 [TaskProgress] Step finished:', {
      text: step.text?.substring(0, 100),
      toolCalls: step.toolCalls?.length,
      toolResults: step.toolResults?.length,
      finishReason: step.finishReason,
    });

    // Update progress based on step completion
    if (onProgressUpdate) {
      const progress: TaskProgressType = {
        completed: (step.stepCount || 0) + 1,
        total: step.totalSteps || 10,
        currentStep: step.text?.substring(0, 50) || 'Processing...',
        percentComplete: Math.round((((step.stepCount || 0) + 1) / (step.totalSteps || 10)) * 100),
      };
      onProgressUpdate(progress);
    }

    // Notify step completion
    if (onStepComplete && step.stepId) {
      onStepComplete(step.stepId, {
        text: step.text,
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
        finishReason: step.finishReason,
      });
    }
  };
}
