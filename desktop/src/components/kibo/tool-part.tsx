import { AlertCircle, CheckCircle, Code, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ToolPartProps {
  toolName: string;
  args: any;
  result?: any;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  isAnimated?: boolean;
}

export function ToolPart({ toolName, args, result, state, isAnimated = true }: ToolPartProps) {
  // Extract server name and tool name from the combined format
  const [serverName, ...toolNameParts] = toolName.split('_');
  const displayToolName = toolNameParts.join('_') || toolName;

  const getStateIcon = () => {
    switch (state) {
      case 'input-streaming':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'input-available':
        return <Code className="h-4 w-4 text-yellow-500" />;
      case 'output-available':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'output-error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStateText = () => {
    switch (state) {
      case 'input-streaming':
        return 'Preparing tool call...';
      case 'input-available':
        return 'Executing tool...';
      case 'output-available':
        return 'Tool completed';
      case 'output-error':
        return 'Tool failed';
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'input-streaming':
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
      case 'input-available':
        return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
      case 'output-available':
        return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
      case 'output-error':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
    }
  };

  return (
    <div
      className={cn(
        'my-2 rounded-lg border p-3 transition-all',
        getStateColor(),
        isAnimated && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex items-start gap-2">
        {getStateIcon()}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {displayToolName}
              {serverName && <span className="ml-1 text-xs text-muted-foreground">from {serverName}</span>}
            </span>
            <span className="text-xs text-muted-foreground">{getStateText()}</span>
          </div>

          {/* Show arguments when available */}
          {(state === 'input-available' || state === 'output-available' || state === 'output-error') && args && (
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Arguments:</div>
              <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Show result when available */}
          {state === 'output-available' && result && (
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Result:</div>
              <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {/* Show error when in error state */}
          {state === 'output-error' && result && (
            <div className="mt-2">
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error:</div>
              <pre className="text-xs bg-red-100 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders multiple tool parts based on message parts
 */
export function ToolParts({ parts }: { parts: any[] }) {
  const toolCalls = new Map<string, any>();

  // Process parts to build tool call states
  parts.forEach((part) => {
    if (part.type === 'tool-call') {
      const existing = toolCalls.get(part.toolCallId) || {};
      toolCalls.set(part.toolCallId, {
        ...existing,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.args,
        state: part.state || (part.args ? 'input-available' : 'input-streaming'),
      });
    } else if (part.type === 'tool-result') {
      const existing = toolCalls.get(part.toolCallId) || {};
      toolCalls.set(part.toolCallId, {
        ...existing,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        result: part.result,
        state: part.error ? 'output-error' : 'output-available',
      });
    }
  });

  if (toolCalls.size === 0) return null;

  return (
    <div className="space-y-2">
      {Array.from(toolCalls.values()).map((toolCall) => (
        <ToolPart
          key={toolCall.toolCallId}
          toolName={toolCall.toolName}
          args={toolCall.args}
          result={toolCall.result}
          state={toolCall.state}
        />
      ))}
    </div>
  );
}
