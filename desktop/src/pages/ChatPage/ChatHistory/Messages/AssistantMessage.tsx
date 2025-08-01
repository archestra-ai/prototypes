import { AIReasoning, AIReasoningContent, AIReasoningTrigger } from '@/components/kibo/ai-reasoning';
import { AIResponse } from '@/components/kibo/ai-response';
import { ChatMessage } from '@/types';

import ToolCallIndicator from './ToolCallIndicator';
import ToolExecutionResult from './ToolExecutionResult';

interface AssistantMessageProps {
  message: ChatMessage;
}

const LoadingIndicator = ({ isToolExecuting }: { isToolExecuting: boolean }) => {
  return (
    <div className="flex items-center space-x-2 mt-2">
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
      <p className="text-muted-foreground text-sm">{isToolExecuting ? 'Executing tools...' : 'Loading...'}</p>
    </div>
  );
};

export default function AssistantMessage({ message }: AssistantMessageProps) {
  const {
    content: assistantContent,
    isToolExecuting,
    isThinkingStreaming,
    isStreaming,
    thinkingContent,
    toolCalls,
  } = message;

  return (
    <div className="relative">
      {(isToolExecuting || (toolCalls && toolCalls.length > 0)) && (
        <ToolCallIndicator toolCalls={toolCalls || []} isExecuting={!!isToolExecuting} />
      )}

      {toolCalls && toolCalls.length > 0 && (
        <div className="space-y-2 mb-4">
          {toolCalls.map((toolCall) => (
            <ToolExecutionResult key={toolCall.id} toolCall={toolCall} />
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

      {(isStreaming || isToolExecuting) && <LoadingIndicator isToolExecuting={isToolExecuting} />}
    </div>
  );
}
