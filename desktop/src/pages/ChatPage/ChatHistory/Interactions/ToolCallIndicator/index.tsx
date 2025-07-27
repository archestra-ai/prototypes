import { AlertCircle, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { ToolCall, ToolCallStatus } from '@/types';

interface ToolCallIndicatorProps {
  toolCalls: ToolCall[];
  isExecuting: boolean;
}

export default function ToolCallIndicator({ toolCalls, isExecuting }: ToolCallIndicatorProps) {
  const [dots, setDots] = useState('');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!isExecuting) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isExecuting]);

  if (toolCalls.length === 0) return null;

  const pendingCalls = toolCalls.filter(
    (call) => call.status === ToolCallStatus.Pending || call.status === ToolCallStatus.Executing
  );
  const completedCalls = toolCalls.filter((call) => call.status === ToolCallStatus.Completed);
  const errorCalls = toolCalls.filter((call) => call.status === ToolCallStatus.Error);

  return (
    <div className="space-y-2 mb-4">
      {isExecuting && pendingCalls.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="animate-spin">
            <Settings className="h-4 w-4 text-blue-600" />
          </div>
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Executing {pendingCalls.length} tool
            {pendingCalls.length !== 1 ? 's' : ''}
            {dots}
          </span>
          <div className="flex gap-1 ml-auto">
            {pendingCalls.map((call) => (
              <Badge key={call.id} variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900">
                {call.serverName}.{call.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {errorCalls.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 dark:text-red-300">
            {errorCalls.length} tool{errorCalls.length !== 1 ? 's' : ''} failed
          </span>
        </div>
      )}
    </div>
  );
}
