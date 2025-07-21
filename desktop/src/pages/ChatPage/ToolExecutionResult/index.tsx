import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Clock, Wrench } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';

interface ToolExecutionResultProps {
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  result: string;
  executionTime?: number;
  status: 'success' | 'error';
  error?: string;
}

export default function ToolExecutionResult({
  serverName,
  toolName,
  arguments: toolArguments,
  result,
  executionTime,
  status,
  error,
}: ToolExecutionResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showArguments, setShowArguments] = useState(false);

  const formatExecutionTime = (time?: number) => {
    if (!time) return '';
    return time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(2)}s`;
  };

  const formatArguments = (args: Record<string, any>) => {
    return JSON.stringify(args, null, 2);
  };

  const truncateResult = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="border rounded-lg p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {status === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
          <Wrench className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-sm">
            <Badge variant="outline" className="mr-1 text-xs">
              {serverName}
            </Badge>
            {toolName}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {executionTime && (
            <>
              <Clock className="h-3 w-3" />
              <span>{formatExecutionTime(executionTime)}</span>
            </>
          )}
        </div>
      </div>

      {/* Tool Arguments */}
      {Object.keys(toolArguments).length > 0 && (
        <Collapsible open={showArguments} onOpenChange={setShowArguments}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-6 p-0 text-xs text-muted-foreground hover:text-foreground">
              {showArguments ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
              Arguments ({Object.keys(toolArguments).length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
              <pre className="whitespace-pre-wrap">{formatArguments(toolArguments)}</pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Result Content */}
      <div className="mt-2">
        {status === 'error' && error ? (
          <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            <strong>Error:</strong> {error}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm">
              {result.length > 200 ? (
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                  <div>
                    <p className="whitespace-pre-wrap">{isExpanded ? result : truncateResult(result)}</p>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="h-6 p-0 mt-1 text-xs text-blue-600 hover:text-blue-800">
                        {isExpanded ? (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3 w-3 mr-1" />
                            Show more
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </Collapsible>
              ) : (
                <p className="whitespace-pre-wrap">{result}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
