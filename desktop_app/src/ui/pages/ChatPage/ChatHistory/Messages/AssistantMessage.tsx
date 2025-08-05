import { UIMessage } from 'ai';

import { AIResponse } from '@ui/components/kibo/ai-response';
import ToolInvocation from '@ui/components/ToolInvocation';

interface AssistantMessageProps {
  message: UIMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
  // Extract text content from parts if available, otherwise use content
  let textContent = '';

  if (message.content) {
    textContent = message.content;
  } else if (message.parts) {
    textContent = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as { text: string }).text)
      .join('');
  }

  return (
    <div className="relative space-y-2">
      {message.toolInvocations && message.toolInvocations.length > 0 && (
        <div className="space-y-2 mb-3">
          {message.toolInvocations.map((tool, index) => (
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
