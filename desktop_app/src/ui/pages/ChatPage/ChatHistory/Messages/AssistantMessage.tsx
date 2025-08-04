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
    <div className="relative">
      <AIResponse>{textContent}</AIResponse>
    </div>
  );
}
