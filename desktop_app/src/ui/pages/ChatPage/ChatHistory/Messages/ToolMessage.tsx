import { UIMessage } from 'ai';
import { Wrench } from 'lucide-react';

interface ToolMessageProps {
  message: UIMessage;
}

export default function ToolMessage({ message }: ToolMessageProps) {
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Tool Result</span>
      </div>
      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="text-sm whitespace-pre-wrap font-mono">{textContent}</div>
      </div>
    </div>
  );
}
