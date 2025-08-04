import { UIMessage } from 'ai';

import { AIResponse } from '@ui/components/kibo/ai-response';

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
        <div className="space-y-2">
          {message.toolInvocations.map((tool, index) => (
            <div key={index} className="p-2 bg-muted rounded text-sm">
              <div className="font-semibold">🔧 {tool.toolName}</div>
              <div className="text-xs opacity-70">Args: {JSON.stringify(tool.args)}</div>
              {tool.result && (
                <div className="mt-1 text-xs">
                  Result: {JSON.stringify(tool.result)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {textContent && <AIResponse>{textContent}</AIResponse>}
    </div>
  );
}
