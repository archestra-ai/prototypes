import { type DynamicToolUIPart, type TextUIPart, UIMessage } from 'ai';

import ToolInvocation from '@ui/components/ToolInvocation';
import { AIResponse } from '@ui/components/kibo/ai-response';
import { ToolCallStatus } from '@ui/types';

interface AssistantMessageProps {
  message: UIMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
  if (!message.parts) {
    return null;
  }

  let accumulatedText = '';

  return (
    <div className="relative space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          accumulatedText += (part as TextUIPart).text;
          // Check if this is the last part or if the next part is not text
          const isLastOrBeforeTool = index === message.parts!.length - 1 || message.parts![index + 1]?.type !== 'text';

          if (isLastOrBeforeTool && accumulatedText) {
            const textToRender = accumulatedText;
            accumulatedText = '';
            return <AIResponse key={`text-${index}`}>{textToRender}</AIResponse>;
          }
          return null;
        } else if (part.type === 'dynamic-tool') {
          const tool = part as DynamicToolUIPart;
          return (
            <ToolInvocation
              key={tool.toolCallId || `tool-${index}`}
              toolName={tool.toolName}
              args={'input' in tool ? tool.input : {}}
              result={'output' in tool ? tool.output : undefined}
              state={
                tool.state === 'output-available'
                  ? ToolCallStatus.Completed
                  : tool.state === 'output-error'
                    ? ToolCallStatus.Error
                    : tool.state === 'input-streaming'
                      ? ToolCallStatus.Pending
                      : ToolCallStatus.Pending
              }
            />
          );
        }
        return null;
      })}
    </div>
  );
}
