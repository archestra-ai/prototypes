import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import * as React from 'react';

import { Progress } from '@ui/components/ui/progress';
import websocketService from '@ui/lib/websocket';
import { useSandboxStore } from '@ui/stores';

interface SandboxStartupProgressProps {
  className?: string;
}

interface ProgressEvent {
  message: string;
  progress?: number;
  error?: string;
}

export function SandboxStartupProgress({ className }: SandboxStartupProgressProps) {
  const { statusSummary } = useSandboxStore();
  const [currentEvent, setCurrentEvent] = React.useState<ProgressEvent | null>(null);
  const [overallProgress, setOverallProgress] = React.useState(0);

  React.useEffect(() => {
    const unsubscribers = [
      websocketService.subscribe('sandbox-startup-started', ({ payload }) => {
        setCurrentEvent(payload);
        setOverallProgress(5);
      }),
      websocketService.subscribe('sandbox-startup-completed', ({ payload }) => {
        setCurrentEvent(payload);
        setOverallProgress(100);
      }),
      websocketService.subscribe('sandbox-startup-failed', ({ payload }) => {
        setCurrentEvent(payload);
        setOverallProgress(0);
      }),
      websocketService.subscribe('sandbox-podman-runtime-progress', ({ payload }) => {
        setCurrentEvent(payload);
        // Podman runtime is 0-40% of overall progress
        setOverallProgress(Math.round((payload.progress || 0) * 0.4));
      }),
      websocketService.subscribe('sandbox-base-image-fetch-started', ({ payload }) => {
        setCurrentEvent(payload);
        setOverallProgress(40);
      }),
      websocketService.subscribe('sandbox-base-image-fetch-progress', ({ payload }) => {
        setCurrentEvent(payload);
        // Base image pull is 40-80% of overall progress
        setOverallProgress(40 + Math.round((payload.progress || 0) * 0.4));
      }),
      websocketService.subscribe('sandbox-base-image-fetch-completed', ({ payload }) => {
        setCurrentEvent(payload);
        setOverallProgress(80);
      }),
      websocketService.subscribe('sandbox-base-image-fetch-failed', ({ payload }) => {
        setCurrentEvent(payload);
      }),
      websocketService.subscribe('sandbox-mcp-server-starting', ({ payload }) => {
        setCurrentEvent({
          message: payload.message,
          progress: 85,
        });
        setOverallProgress(85);
      }),
      websocketService.subscribe('sandbox-mcp-server-started', ({ payload }) => {
        setCurrentEvent({
          message: payload.message,
          progress: 95,
        });
        setOverallProgress(95);
      }),
      websocketService.subscribe('sandbox-mcp-server-failed', ({ payload }) => {
        setCurrentEvent({
          message: payload.message,
          error: payload.error,
        });
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // Don't show if sandbox is already running or not installed
  if (statusSummary.status === 'running' || statusSummary.status === 'not_installed') {
    return null;
  }

  const hasError = currentEvent?.error || statusSummary.status === 'error';
  const isComplete = overallProgress === 100;

  return (
    <div className={`space-y-2 p-4 border rounded-lg ${className}`}>
      <div className="flex items-center gap-2">
        {hasError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        <h3 className="text-sm font-medium">Sandbox Initialization</h3>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {currentEvent?.message || statusSummary.runtime.startupMessage || 'Initializing...'}
        </p>
        {hasError && (
          <p className="text-xs text-destructive">{currentEvent?.error || statusSummary.runtime.startupError}</p>
        )}
      </div>

      {!hasError && (
        <div className="space-y-1">
          <Progress value={overallProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{overallProgress}%</p>
        </div>
      )}

      {/* Show detailed progress for specific stages */}
      {statusSummary.runtime.startupPercentage > 0 && statusSummary.runtime.startupPercentage < 100 && (
        <div className="mt-2 pt-2 border-t space-y-1">
          <p className="text-xs text-muted-foreground">Podman Runtime</p>
          <Progress value={statusSummary.runtime.startupPercentage} className="h-1" />
        </div>
      )}

      {statusSummary.runtime.baseImage.pullPercentage > 0 && statusSummary.runtime.baseImage.pullPercentage < 100 && (
        <div className="mt-2 pt-2 border-t space-y-1">
          <p className="text-xs text-muted-foreground">
            {statusSummary.runtime.baseImage.pullMessage || 'Pulling base image'}
          </p>
          <Progress value={statusSummary.runtime.baseImage.pullPercentage} className="h-1" />
        </div>
      )}
    </div>
  );
}
