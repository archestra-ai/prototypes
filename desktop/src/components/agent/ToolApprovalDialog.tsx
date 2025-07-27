import { AlertTriangle, Clock, FileText, Server, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/tailwind';
import { ToolApprovalRequest, ToolApprovalResult } from '@/types/agent-ui';

interface ToolApprovalDialogProps {
  request: ToolApprovalRequest | null;
  onApprove: (result: ToolApprovalResult) => void;
  onReject: (result: ToolApprovalResult) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ToolApprovalDialog({ request, onApprove, onReject, isOpen, onOpenChange }: ToolApprovalDialogProps) {
  const [rememberDecision, setRememberDecision] = useState(false);
  const [reason, setReason] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!request?.timeout) return;

    const endTime = request.timestamp.getTime() + request.timeout;
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeRemaining(remaining);

      if (remaining === 0) {
        handleReject('Request timed out');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request]);

  if (!request) return null;

  const handleApprove = () => {
    const result: ToolApprovalResult = {
      requestId: request.id,
      approved: true,
      reason: reason || 'User approved',
      timestamp: new Date(),
      rememberDecision,
    };
    onApprove(result);
    onOpenChange(false);
    resetState();
  };

  const handleReject = (rejectReason?: string) => {
    const result: ToolApprovalResult = {
      requestId: request.id,
      approved: false,
      reason: rejectReason || reason || 'User rejected',
      timestamp: new Date(),
      rememberDecision,
    };
    onReject(result);
    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setRememberDecision(false);
    setReason('');
  };

  const formatTimeRemaining = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getRiskLevelColor = (level?: string) => {
    switch (level) {
      case 'high':
        return 'text-red-600 bg-red-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'file':
        return 'bg-blue-100 text-blue-700';
      case 'write':
        return 'bg-orange-100 text-orange-700';
      case 'execute':
        return 'bg-red-100 text-red-700';
      case 'system':
        return 'bg-purple-100 text-purple-700';
      case 'search':
        return 'bg-green-100 text-green-700';
      case 'read':
        return 'bg-cyan-100 text-cyan-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Tool Approval Required</span>
            {timeRemaining !== null && (
              <div className="flex items-center gap-2 text-sm font-normal">
                <Clock className="h-4 w-4" />
                <span className={cn(timeRemaining < 30000 ? 'text-red-600' : 'text-gray-600')}>
                  {formatTimeRemaining(timeRemaining)}
                </span>
              </div>
            )}
          </DialogTitle>
          <DialogDescription>
            The AI agent is requesting permission to execute a tool. Review the details below and decide whether to
            approve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tool Information */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-gray-600" />
                <span className="font-semibold text-lg">{request.toolName}</span>
              </div>
              <div className="flex gap-2">
                <Badge className={getCategoryColor(request.category)}>{request.category}</Badge>
                {request.isSensitive && <Badge variant="destructive">Sensitive</Badge>}
              </div>
            </div>

            {request.description && <p className="text-sm text-gray-600">{request.description}</p>}

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Server className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Server:</span>
                <span className="font-medium">{request.serverName}</span>
              </div>
              {request.metadata?.riskLevel && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Risk:</span>
                  <span
                    className={cn(
                      'font-medium px-2 py-0.5 rounded text-xs',
                      getRiskLevelColor(request.metadata.riskLevel)
                    )}
                  >
                    {request.metadata.riskLevel.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Arguments */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-gray-600" />
              <span className="font-medium">Arguments</span>
            </div>
            <pre className="text-sm bg-gray-50 p-3 rounded overflow-x-auto">
              {JSON.stringify(request.arguments, null, 2)}
            </pre>
          </div>

          {/* Potential Impact */}
          {request.metadata?.potentialImpact && request.metadata.potentialImpact.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Potential Impact:</div>
                <ul className="list-disc list-inside space-y-1">
                  {request.metadata.potentialImpact.map((impact, index) => (
                    <li key={index} className="text-sm">
                      {impact}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Remember Decision */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="remember"
              checked={rememberDecision}
              onCheckedChange={(checked: boolean) => setRememberDecision(checked)}
            />
            <label
              htmlFor="remember"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Remember this decision for similar requests
            </label>
          </div>

          {/* Optional Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Reason (optional)</label>
            <textarea
              className="w-full min-h-[60px] px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Provide a reason for your decision..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleReject()}>
            Reject
          </Button>
          <Button
            variant="outline"
            onClick={() => handleReject('Cancel all pending approvals')}
            className="text-red-600 hover:text-red-700"
          >
            Reject All
          </Button>
          <Button onClick={handleApprove} className="bg-blue-600 hover:bg-blue-700">
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
