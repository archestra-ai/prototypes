import type { UIMessage } from 'ai';

import { AIResponse } from '@/components/kibo/ai-response';
import { ToolParts } from '@/components/kibo/tool-part';

interface MessageContentProps {
  message: UIMessage;
}

export function MessageContent({ message }: MessageContentProps) {
  if (message.role === 'user') {
    if (message.parts && message.parts.length > 0) {
      const textParts = message.parts.filter((part: any) => part.type === 'text');
      const content = textParts.map((part: any) => part.text).join('');
      return <div className="prose dark:prose-invert">{content}</div>;
    }
    const content = (message as any).content || (message as any).text || '';
    return <div className="prose dark:prose-invert">{content}</div>;
  }

  if (!message.parts || message.parts.length === 0) {
    const content = (message as any).content || (message as any).text || '';
    return <AIResponse>{content}</AIResponse>;
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part: any, index: number) => {
        switch (part.type) {
          case 'text':
            return part.text ? <AIResponse key={index}>{part.text}</AIResponse> : null;

          case 'tool-call':
          case 'tool-result':
            // These are handled by ToolParts component
            return null;

          case 'data':
            // Handle custom data parts
            // For other data parts, show as debug info in dev mode
            if (process.env.NODE_ENV === 'development') {
              return (
                <pre key={index} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  {JSON.stringify(part.data, null, 2)}
                </pre>
              );
            }
            return null;

          default:
            if (process.env.NODE_ENV === 'development') {
              console.warn('Unknown message part type:', part);
            }
            return null;
        }
      })}

      {message.parts.some((p: any) => p.type === 'tool-call' || p.type === 'tool-result') && (
        <ToolParts parts={message.parts} />
      )}
    </div>
  );
}
