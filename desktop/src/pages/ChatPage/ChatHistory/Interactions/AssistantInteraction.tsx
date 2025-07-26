import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';

import ToolCallIndicator from './ToolCallIndicator';
import ToolExecutionResult from './ToolExecutionResult';

// TODO: update this type...
interface AssistantInteractionProps {
  interaction: any;
}

export default function AssistantInteraction({ interaction }: AssistantInteractionProps) {
  return (
    <div className="relative">
      {(interaction.isToolExecuting || interaction.toolCalls) && (
        <ToolCallIndicator toolCalls={interaction.toolCalls || []} isExecuting={!!interaction.isToolExecuting} />
      )}

      {interaction.toolCalls && interaction.toolCalls.length > 0 && (
        <div className="space-y-2 mb-4">
          {interaction.toolCalls.map((toolCall: any) => (
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

      {interaction.thinkingContent && (
        <AIReasoning isStreaming={interaction.isThinkingStreaming} className="mb-4">
          <AIReasoningTrigger />
          <AIReasoningContent>{interaction.thinkingContent}</AIReasoningContent>
        </AIReasoning>
      )}

      <AIResponse>{interaction.content}</AIResponse>

      {(interaction.isStreaming || interaction.isToolExecuting) && (
        <div className="flex items-center space-x-2 mt-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <p className="text-muted-foreground text-sm">
            {interaction.isToolExecuting ? 'Executing tools...' : 'Loading...'}
          </p>
        </div>
      )}
    </div>
  );
}
