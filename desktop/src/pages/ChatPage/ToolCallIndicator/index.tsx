import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToolCallInfo } from '@/types';

interface ToolCallIndicatorProps {
  toolCalls: ToolCallInfo[];
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

  const pendingCalls = toolCalls.filter((call) => call.status === 'pending' || call.status === 'executing');
  const completedCalls = toolCalls.filter((call) => call.status === 'completed');
  const errorCalls = toolCalls.filter((call) => call.status === 'error');

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
                {call.serverName}.{call.toolName}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {completedCalls.length > 0 && (
        <div className="p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-300">
              {completedCalls.length} tool{completedCalls.length !== 1 ? 's' : ''} completed successfully
            </span>
          </div>

          <Collapsible open={showResults} onOpenChange={setShowResults}>
            <CollapsibleTrigger className="flex items-center gap-1 mt-2 text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors">
              {showResults ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              View results
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="space-y-1 pl-4">
                {completedCalls.map((call) => (
                  <div
                    key={call.id}
                    className="text-xs text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 p-2 rounded border-l-2 border-green-400"
                  >
                    <div className="font-medium mb-1">
                      {call.serverName}.{call.toolName}
                    </div>
                    <div className="font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap break-words max-w-full">
                      {call.result}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
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
