import { Bot, Brain, CheckCircle, Loader2, Wrench } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { useChatStore } from '@/stores/chat-store';

import ToolCallIndicator from '../ToolCallIndicator';
import ToolExecutionResult from '../ToolExecutionResult';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

export default function ChatHistory(_props: ChatHistoryProps) {
  const { chatHistory } = useChatStore();
  const { mode: agentMode, progress, reasoningMode, currentObjective } = useAgentStore();

  // Helper function to format agent mode
  const formatAgentMode = (mode: string) => {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  // Helper function to get agent mode color
  const getAgentModeColor = (mode: string) => {
    switch (mode) {
      case 'initializing':
        return 'text-yellow-600';
      case 'planning':
        return 'text-blue-600';
      case 'executing':
        return 'text-green-600';
      case 'paused':
        return 'text-orange-600';
      case 'completed':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const scrollToBottom = useCallback(() => {
    const scrollArea = document.querySelector(CHAT_SCROLL_AREA_SELECTOR);
    if (scrollArea) {
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  const triggerScroll = useCallback(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [scrollToBottom]);

  // Trigger scroll when chat history changes
  useEffect(() => {
    triggerScroll();
  }, [chatHistory]);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-96 w-full rounded-md border p-4">
      <div className="space-y-4">
        {/* Agent Status Message */}
        {agentMode !== 'idle' && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">AI Agent Status</span>
              <span className={cn('text-sm font-medium', getAgentModeColor(agentMode))}>
                {formatAgentMode(agentMode)}
              </span>
            </div>

            {currentObjective && (
              <div className="text-sm text-muted-foreground mb-2">
                <span className="font-medium">Objective:</span> {currentObjective}
              </div>
            )}

            {agentMode === 'executing' && progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress</span>
                  <span className="text-muted-foreground">
                    {progress.completed} / {progress.total} steps
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                  />
                </div>
                {progress.currentStep && (
                  <div className="text-xs text-muted-foreground mt-1">Current: {progress.currentStep}</div>
                )}
              </div>
            )}

            {agentMode === 'completed' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Task completed successfully
              </div>
            )}

            {(agentMode === 'initializing' || agentMode === 'planning') && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {agentMode === 'initializing' ? 'Initializing agent...' : 'Planning execution...'}
              </div>
            )}
          </div>
        )}

        {chatHistory.map((msg, index) => (
          <div
            key={msg.id || index}
            className={cn(
              'p-3 rounded-lg',
              msg.role === 'user'
                ? 'bg-primary/10 border border-primary/20 ml-8'
                : msg.role === 'assistant'
                  ? 'bg-secondary/50 border border-secondary mr-8'
                  : msg.role === 'error'
                    ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                    : msg.role === 'system'
                      ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600'
                      : msg.role === 'tool'
                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-600'
                        : 'bg-muted border'
            )}
          >
            <div className="text-xs font-medium mb-1 opacity-70 capitalize">{msg.role}</div>
            {msg.role === 'user' ? (
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            ) : msg.role === 'assistant' ? (
              <div className="relative">
                {(msg.isToolExecuting || msg.toolCalls) && (
                  <ToolCallIndicator toolCalls={msg.toolCalls || []} isExecuting={!!msg.isToolExecuting} />
                )}

                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {msg.toolCalls.map((toolCall) => (
                      <ToolExecutionResult
                        key={toolCall.id}
                        serverName={toolCall.serverName}
                        toolName={toolCall.toolName}
                        arguments={toolCall.arguments}
                        result={toolCall.result || ''}
                        executionTime={toolCall.executionTime}
                        status={toolCall.error ? 'error' : 'success'}
                        error={toolCall.error}
                      />
                    ))}
                  </div>
                )}

                {msg.thinkingContent && (
                  <AIReasoning isStreaming={msg.isThinkingStreaming} className="mb-4">
                    <AIReasoningTrigger />
                    <AIReasoningContent>{msg.thinkingContent}</AIReasoningContent>
                  </AIReasoning>
                )}

                {/* Show agent reasoning if available and not hidden */}
                {reasoningMode !== 'hidden' && msg.agentMetadata?.reasoning && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Agent Reasoning ({msg.agentMetadata.reasoning.type})
                      </span>
                    </div>
                    <div className="text-sm text-blue-900 dark:text-blue-100">
                      {msg.agentMetadata.reasoning.content}
                    </div>
                    {msg.agentMetadata.reasoning.alternatives &&
                      msg.agentMetadata.reasoning.alternatives.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            Alternatives considered:
                          </span>
                          {msg.agentMetadata.reasoning.alternatives.map((alt) => (
                            <div key={alt.id} className="text-xs text-blue-800 dark:text-blue-200 pl-2">
                              • {alt.description}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}

                <AIResponse>{msg.content}</AIResponse>

                {(msg.isStreaming || msg.isToolExecuting) && (
                  <div className="flex items-center space-x-2 mt-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground text-sm">
                      {msg.isToolExecuting ? 'Executing tools...' : 'Loading...'}
                    </p>
                  </div>
                )}
              </div>
            ) : msg.role === 'tool' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Tool Result</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-sm whitespace-pre-wrap font-mono">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
