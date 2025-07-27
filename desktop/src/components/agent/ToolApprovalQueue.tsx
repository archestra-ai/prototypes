import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/tailwind';
import {
  HumanInLoopHandler,
  ToolApprovalRequest,
  ToolApprovalResult,
  createUIApprovalHandler,
} from '@/services/agent/human-in-loop';
import { useAgentStore } from '@/stores/agent-store';

import { ToolApprovalDialog } from './ToolApprovalDialog';

interface ToolApprovalQueueProps {
  className?: string;
}

export function ToolApprovalQueue({ className }: ToolApprovalQueueProps) {
  const [pendingRequests, setPendingRequests] = useState<ToolApprovalRequest[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ToolApprovalRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [, setApprovalHandler] = useState<HumanInLoopHandler | null>(null);
  const [resolveCallbacks, setResolveCallbacks] = useState<Map<string, (result: ToolApprovalResult) => void>>(
    new Map()
  );

  // Get preferences from agent store
  const { preferences, updatePreferences } = useAgentStore();

  // Initialize the approval handler
  useEffect(() => {
    const handler = createUIApprovalHandler(async (request) => {
      return new Promise<ToolApprovalResult>((resolve) => {
        // Store the resolve callback
        setResolveCallbacks((prev) => new Map(prev).set(request.id, resolve));

        // Add to pending requests
        setPendingRequests((prev) => [...prev, request]);

        // If no current request, show this one
        if (!currentRequest) {
          setCurrentRequest(request);
          setIsDialogOpen(true);
        }
      });
    });

    // Apply preferences
    handler.updateAutoApprovalSettings({
      categories: preferences.autoApproveCategories,
      servers: preferences.autoApproveServers,
    });

    setApprovalHandler(handler);

    // Store handler in window for agent to access
    (window as any).__toolApprovalHandler = handler;

    return () => {
      delete (window as any).__toolApprovalHandler;
    };
  }, [preferences]);

  // Handle approval
  const handleApprove = useCallback(
    (result: ToolApprovalResult) => {
      const resolve = resolveCallbacks.get(result.requestId);
      if (resolve) {
        resolve(result);
        setResolveCallbacks((prev) => {
          const next = new Map(prev);
          next.delete(result.requestId);
          return next;
        });
      }

      // Remove from pending
      setPendingRequests((prev) => prev.filter((r) => r.id !== result.requestId));

      // Update preferences if remember decision is set
      if (result.rememberDecision && currentRequest) {
        if (currentRequest.category && !preferences.autoApproveCategories.includes(currentRequest.category)) {
          updatePreferences({
            autoApproveCategories: [...preferences.autoApproveCategories, currentRequest.category],
          });
        }
      }

      // Process next request
      processNextRequest();
    },
    [resolveCallbacks, currentRequest, preferences, updatePreferences]
  );

  // Handle rejection
  const handleReject = useCallback(
    (result: ToolApprovalResult) => {
      const resolve = resolveCallbacks.get(result.requestId);
      if (resolve) {
        resolve(result);
        setResolveCallbacks((prev) => {
          const next = new Map(prev);
          next.delete(result.requestId);
          return next;
        });
      }

      // Remove from pending
      setPendingRequests((prev) => prev.filter((r) => r.id !== result.requestId));

      // If rejecting all, reject all pending
      if (result.reason?.includes('cancel all')) {
        pendingRequests.forEach((req) => {
          if (req.id !== result.requestId) {
            const rejectResult: ToolApprovalResult = {
              requestId: req.id,
              approved: false,
              reason: 'Cancelled by user',
              timestamp: new Date(),
            };

            const resolve = resolveCallbacks.get(req.id);
            if (resolve) {
              resolve(rejectResult);
            }
          }
        });

        setPendingRequests([]);
        setResolveCallbacks(new Map());
      }

      // Process next request
      processNextRequest();
    },
    [resolveCallbacks, pendingRequests]
  );

  // Process next request in queue
  const processNextRequest = useCallback(() => {
    setPendingRequests((prev) => {
      if (prev.length > 0) {
        const [next, ...rest] = prev;
        setCurrentRequest(next);
        setIsDialogOpen(true);
        return rest;
      } else {
        setCurrentRequest(null);
        setIsDialogOpen(false);
        return [];
      }
    });
  }, []);

  // Show queue indicator if there are pending requests
  if (pendingRequests.length === 0 && !currentRequest) {
    return null;
  }

  const totalPending = pendingRequests.length + (currentRequest ? 1 : 0);

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
        <div className="relative">
          <Bell className="h-5 w-5 text-yellow-600 animate-pulse" />
          {totalPending > 1 && (
            <Badge
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
              variant="destructive"
            >
              {totalPending}
            </Badge>
          )}
        </div>
        <span className="text-sm text-yellow-600 font-medium">Tool approval required</span>
      </div>

      <ToolApprovalDialog
        request={currentRequest}
        onApprove={handleApprove}
        onReject={handleReject}
        isOpen={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open && currentRequest) {
            // If closed without decision, reject
            handleReject({
              requestId: currentRequest.id,
              approved: false,
              reason: 'Dialog closed without decision',
              timestamp: new Date(),
            });
          }
        }}
      />
    </>
  );
}

// Hook to get the current approval handler
export function useToolApprovalHandler(): HumanInLoopHandler | null {
  return (window as any).__toolApprovalHandler || null;
}
