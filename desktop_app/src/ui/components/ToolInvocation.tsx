import { ChevronDown, ChevronRight, Clock, Wrench } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@ui/lib/utils/tailwind';

interface ToolInvocationProps {
  toolName: string;
  toolCallId?: string;
  args: any;
  result?: any;
  state?: 'pending' | 'completed' | 'error' | 'requires-action';
  startTime?: number;
  endTime?: number;
  onAddToolResult?: (params: { toolCallId: string; result: string }) => void;
}

export default function ToolInvocation({ 
  toolName,
  toolCallId,
  args, 
  result, 
  state = 'completed',
  startTime,
  endTime,
  onAddToolResult
}: ToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const duration = startTime && endTime ? endTime - startTime : null;
  
  // Parse result content if it's from MCP
  let displayResult = result;
  if (result?.content && Array.isArray(result.content)) {
    // Extract text content from MCP response
    const textContent = result.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');
    displayResult = textContent || result;
  }
  
  const formatJson = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const isRequiresAction = state === 'requires-action';

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden transition-all",
      state === 'pending' && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
      state === 'completed' && "border-green-500 bg-green-50/50 dark:bg-green-950/20",
      state === 'error' && "border-red-500 bg-red-50/50 dark:bg-red-950/20",
      state === 'requires-action' && "border-orange-500 bg-orange-50/50 dark:bg-orange-950/20"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex-shrink-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <Wrench className={cn(
          "h-4 w-4 flex-shrink-0",
          state === 'pending' && "text-blue-600 animate-pulse",
          state === 'completed' && "text-green-600",
          state === 'error' && "text-red-600"
        )} />
        <span className="font-medium text-sm flex-1 text-left">{toolName}</span>
        {duration !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{duration}ms</span>
          </div>
        )}
        {state === 'pending' && (
          <span className="text-xs text-blue-600 animate-pulse">Running...</span>
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {Object.keys(args).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Arguments:</div>
              <pre className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto">
                {formatJson(args)}
              </pre>
            </div>
          )}
          
          {result && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Result:</div>
              <pre className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
                {typeof displayResult === 'string' ? displayResult : formatJson(displayResult)}
              </pre>
            </div>
          )}
          
          {state === 'error' && result && (
            <div className="text-xs text-red-600 dark:text-red-400">
              Error: {result.message || String(result)}
            </div>
          )}
          
          {/* Action buttons for tools requiring user input */}
          {isRequiresAction && toolCallId && onAddToolResult && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onAddToolResult({ 
                  toolCallId, 
                  result: 'Yes, confirmed.' 
                })}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Yes
              </button>
              <button
                onClick={() => onAddToolResult({ 
                  toolCallId, 
                  result: 'No, denied.' 
                })}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}