import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';
import { ToolCallStatus } from '@/types';

import ToolCallIndicator from './ToolCallIndicator';
import ToolExecutionResult from './ToolExecutionResult';

// TODO: update this type...
interface AssistantInteractionProps {
  interaction: any;
}

export default function AssistantInteraction({ interaction: { content } }: AssistantInteractionProps) {
  const {
    content: assistantContent,
    toolCalls,
    isToolExecuting,
    isThinkingStreaming,
    isStreaming,
    thinkingContent,
  } = content;

  return (
    <div className="relative">
      {(isToolExecuting || toolCalls) && (
        <ToolCallIndicator toolCalls={toolCalls || []} isExecuting={!!isToolExecuting} />
      )}

      {toolCalls && toolCalls.length > 0 && (
        <div className="space-y-2 mb-4">
          {toolCalls.map((toolCall: any) => (
            <ToolExecutionResult
              key={toolCall.id}
              serverName={toolCall.serverName}
              toolName={toolCall.toolName}
              arguments={toolCall.arguments}
              result={toolCall.result || ''}
              executionTime={toolCall.executionTime}
              status={toolCall.error ? ToolCallStatus.Error : ToolCallStatus.Completed}
              error={toolCall.error}
            />
          ))}
        </div>
      )}

      {thinkingContent && (
        <AIReasoning isStreaming={isThinkingStreaming} className="mb-4">
          <AIReasoningTrigger />
          <AIReasoningContent>{thinkingContent}</AIReasoningContent>
        </AIReasoning>
      )}

      <AIResponse>{assistantContent}</AIResponse>

      {(isStreaming || isToolExecuting) && (
        <div className="flex items-center space-x-2 mt-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <p className="text-muted-foreground text-sm">{isToolExecuting ? 'Executing tools...' : 'Loading...'}</p>
        </div>
      )}
    </div>
  );
}
