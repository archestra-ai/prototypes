import {
  Brain,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  Target,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/tailwind';
import { useAgentStore } from '@/stores/agent-store';
import { Alternative, ReasoningDataPart, ReasoningEntry } from '@/types/agent';

interface ReasoningPanelProps {
  className?: string;
  maxHeight?: string;
  // Optional: reasoning from v5 message parts for real-time streaming
  streamingReasoning?: ReasoningDataPart[];
  isStreaming?: boolean;
}

export const ReasoningPanel = React.memo(function ReasoningPanelInner({
  className,
  maxHeight = '400px',
  streamingReasoning,
  isStreaming = false,
}: ReasoningPanelProps) {
  const storeReasoning = useAgentStore((state) => state.reasoningText);
  const reasoningMode = useAgentStore((state) => state.reasoningMode);
  const setReasoningMode = useAgentStore((state) => state.setReasoningMode);
  const formatReasoningForUI = useAgentStore((state) => state.formatReasoningForUI);
  const isAgentActive = useAgentStore((state) => state.isAgentActive);

  // Combine store reasoning with streaming reasoning from v5 message parts
  const reasoning = useMemo(() => {
    if (streamingReasoning && streamingReasoning.length > 0) {
      // Extract reasoning entries from v5 data parts
      const v5Entries = streamingReasoning.map((part) => part.data.entry);
      // Merge with store reasoning, avoiding duplicates by ID
      const existingIds = new Set(storeReasoning.map((r) => r.id));
      const newEntries = v5Entries.filter((e) => !existingIds.has(e.id));
      return [...storeReasoning, ...newEntries];
    }
    return storeReasoning;
  }, [storeReasoning, streamingReasoning]);

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Auto-scroll to bottom when new reasoning arrives during streaming
  useEffect(() => {
    if (isStreaming && autoScrollEnabled && scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [reasoning, isStreaming, autoScrollEnabled]);

  // Toggle expanded state for an entry
  const toggleExpanded = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  // Get icon for reasoning type
  const getReasoningIcon = (type: ReasoningEntry['type']) => {
    switch (type) {
      case 'planning':
        return <Target className="h-4 w-4" />;
      case 'decision':
        return <Lightbulb className="h-4 w-4" />;
      case 'evaluation':
        return <Brain className="h-4 w-4" />;
      case 'adaptation':
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  // Get color for reasoning type
  const getReasoningColor = (type: ReasoningEntry['type']) => {
    switch (type) {
      case 'planning':
        return 'text-blue-600 bg-blue-50';
      case 'decision':
        return 'text-yellow-600 bg-yellow-50';
      case 'evaluation':
        return 'text-purple-600 bg-purple-50';
      case 'adaptation':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // Format confidence as percentage
  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    const timestamp = typeof date === 'string' ? new Date(date) : date;
    return timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Filter reasoning based on mode
  const filteredReasoning = useMemo(() => {
    if (reasoningMode === 'hidden') return [];
    return reasoning;
  }, [reasoning, reasoningMode]);

  if (!isAgentActive && reasoning.length === 0) {
    return null;
  }

  return (
    <Card className={cn('transition-all duration-300', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Agent Reasoning
              {isStreaming && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription className="mt-1">
              {reasoning.length} reasoning {reasoning.length === 1 ? 'entry' : 'entries'}
              {isStreaming && ' • Streaming...'}
            </CardDescription>
          </div>
          <Select value={reasoningMode} onValueChange={setReasoningMode}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="verbose">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>Verbose</span>
                </div>
              </SelectItem>
              <SelectItem value="concise">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Concise</span>
                </div>
              </SelectItem>
              <SelectItem value="hidden">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4" />
                  <span>Hidden</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {reasoningMode !== 'hidden' && (
        <CardContent className="p-0">
          <ScrollArea ref={scrollAreaRef} className="w-full" style={{ maxHeight }}>
            <div className="space-y-2 p-4">
              {filteredReasoning.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No reasoning entries yet</div>
              ) : (
                filteredReasoning.map((entry) => {
                  const isExpanded = expandedEntries.has(entry.id);
                  const formattedContent = formatReasoningForUI(entry);

                  return (
                    <Collapsible key={entry.id} open={isExpanded} onOpenChange={() => toggleExpanded(entry.id)}>
                      <div className="rounded-lg border bg-card">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full p-3 justify-start hover:bg-transparent">
                            <div className="flex items-start gap-2 w-full">
                              <div className="mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={cn('p-1 rounded', getReasoningColor(entry.type))}>
                                    {getReasoningIcon(entry.type)}
                                  </div>
                                  <span className="font-medium capitalize">{entry.type}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {formatConfidence(entry.confidence)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {formatTimestamp(entry.timestamp)}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {reasoningMode === 'concise' ? formattedContent.split('\n')[0] : formattedContent}
                                </p>
                                {/* Show streaming indicator for the latest entry */}
                                {isStreaming && entry.id === reasoning[reasoning.length - 1]?.id && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <div className="h-1 w-1 bg-blue-600 rounded-full animate-pulse" />
                                    <div className="h-1 w-1 bg-blue-600 rounded-full animate-pulse delay-75" />
                                    <div className="h-1 w-1 bg-blue-600 rounded-full animate-pulse delay-150" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </Button>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-3 pb-3">
                            <Separator className="mb-3" />

                            {/* Full reasoning content */}
                            <div className="space-y-3">
                              <div>
                                <h4 className="text-sm font-medium mb-1">Reasoning</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{formattedContent}</p>
                              </div>

                              {/* Alternatives if available */}
                              {entry.alternatives && entry.alternatives.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">Alternatives Considered</h4>
                                  <div className="space-y-2">
                                    {entry.alternatives.map((alt: Alternative) => (
                                      <div
                                        key={alt.id}
                                        className={cn(
                                          'rounded-md border p-2 text-sm',
                                          entry.selectedOption === alt.id && 'border-primary bg-primary/5'
                                        )}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-medium">{alt.description}</span>
                                          {entry.selectedOption === alt.id && (
                                            <Badge variant="secondary" className="text-xs">
                                              Selected
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div>
                                            <span className="text-green-600 font-medium">Pros:</span>
                                            <ul className="list-disc list-inside text-muted-foreground">
                                              {alt.pros.map((pro, i) => (
                                                <li key={i}>{pro}</li>
                                              ))}
                                            </ul>
                                          </div>
                                          <div>
                                            <span className="text-red-600 font-medium">Cons:</span>
                                            <ul className="list-disc list-inside text-muted-foreground">
                                              {alt.cons.map((con, i) => (
                                                <li key={i}>{con}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          Feasibility: {formatConfidence(alt.feasibility)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Context if available */}
                              {entry.context && Object.keys(entry.context).length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-1">Context</h4>
                                  <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">
                                    {JSON.stringify(entry.context, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Auto-scroll toggle for streaming mode */}
          {isStreaming && (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
                className="text-xs"
              >
                {autoScrollEnabled ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
});

// Helper hook to extract reasoning from v5 messages
export function useReasoningFromMessages(messages: any[]): {
  reasoning: ReasoningDataPart[];
  isStreaming: boolean;
} {
  const reasoning = useMemo(() => {
    const parts: ReasoningDataPart[] = [];

    messages.forEach((msg) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        msg.content.forEach((part: any) => {
          if (part.type === 'data' && part.data?.type === 'reasoning') {
            parts.push(part as ReasoningDataPart);
          }
        });
      }
    });

    return parts;
  }, [messages]);

  // Check if the last message is still streaming
  const isStreaming =
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    !messages[messages.length - 1].isComplete;

  return { reasoning, isStreaming };
}
