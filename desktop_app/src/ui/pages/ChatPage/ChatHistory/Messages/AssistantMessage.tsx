import { UIMessage } from 'ai';

import ToolInvocation from '@ui/components/ToolInvocation';
import { AIResponse } from '@ui/components/kibo/ai-response';

interface AssistantMessageProps {
  message: UIMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
  // Extract text content and dynamic tools from parts
  let textContent = '';
  const dynamicTools: any[] = [];

  if (message.content) {
    textContent = message.content;
  } else if (message.parts) {
    message.parts.forEach((part: any) => {
      if (part.type === 'text') {
        textContent += part.text;
      } else if (part.type === 'dynamic-tool') {
        dynamicTools.push(part);
      }
    });
  }

  // Also check for toolInvocations (for backward compatibility)
  const hasToolInvocations = message.toolInvocations && message.toolInvocations.length > 0;
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
              args={tool.input || tool.args || {}}
              result={tool.output || tool.result}
              state={
                tool.state === 'output-available'
                  ? 'completed'
                  : tool.state === 'output-error'
                    ? 'error'
                    : tool.state === 'input-streaming'
                      ? 'pending'
                      : 'pending'
              }
              startTime={tool.startTime}
              endTime={tool.endTime}
            />
          ))}
        </div>
      )}

      {/* Display tool invocations (fallback) */}
      {!hasDynamicTools && hasToolInvocations && (
        <div className="space-y-2 mb-3">
          {message.toolInvocations.map((tool: any, index: number) => (
            <ToolInvocation
              key={tool.toolCallId || index}
              toolName={tool.toolName}
              args={tool.args}
              result={tool.result}
              state={tool.state || (tool.result ? 'completed' : 'pending')}
            />
          ))}
        </div>
      )}

      {textContent && <AIResponse>{textContent}</AIResponse>}
    </div>
  );
}
