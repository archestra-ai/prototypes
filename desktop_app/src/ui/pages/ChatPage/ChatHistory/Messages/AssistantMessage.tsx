import { UIMessage, type TextUIPart, type DynamicToolUIPart } from 'ai';

import ToolInvocation from '@ui/components/ToolInvocation';
import { AIResponse } from '@ui/components/kibo/ai-response';
import { ToolCallStatus } from '@ui/types';

interface AssistantMessageProps {
  message: UIMessage;
}

/**
 * TODO: fix the typing issues in this file (also remove the "any" types)
 */
export default function AssistantMessage({ message }: AssistantMessageProps) {
  // Extract text content and dynamic tools from parts array (UIMessage in ai SDK v5 uses parts)
  let textContent = '';
  const dynamicTools: DynamicToolUIPart[] = [];

  if (message.parts) {
    message.parts.forEach((part) => {
      if (part.type === 'text') {
        textContent += (part as TextUIPart).text;
      } else if (part.type === 'dynamic-tool') {
        dynamicTools.push(part as DynamicToolUIPart);
      }
    });
  }

  const hasDynamicTools = dynamicTools.length > 0;

  return (
    <div className="relative space-y-2">
      {/* Display dynamic tools from parts */}
      {hasDynamicTools && (
        <div className="space-y-2 mb-3">
          {dynamicTools.map((tool, index) => (
            <ToolInvocation
              key={tool.toolCallId || index}
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
          ))}
        </div>
      )}


      {textContent && <AIResponse>{textContent}</AIResponse>}
    </div>
  );
}
