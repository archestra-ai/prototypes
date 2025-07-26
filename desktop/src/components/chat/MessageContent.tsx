import type { UIMessage } from 'ai';

import { ReasoningDisplay } from '@/components/agent';
import { AIResponse } from '@/components/kibo/ai-response';
import { ToolParts } from '@/components/kibo/tool-part';

interface MessageContentProps {
  message: UIMessage;
  showReasoning?: boolean;
}

export function MessageContent({ message, showReasoning = true }: MessageContentProps) {
  // For user messages, show the text from parts
  if (message.role === 'user') {
    // In v5, user messages have their text in the parts array
    if (message.parts && message.parts.length > 0) {
      const textParts = message.parts.filter((part: any) => part.type === 'text');
      const content = textParts.map((part: any) => part.text).join('');
      return <div className="prose dark:prose-invert">{content}</div>;
    }
    // Fallback for compatibility
    const content = (message as any).content || (message as any).text || '';
    return <div className="prose dark:prose-invert">{content}</div>;
  }

  // For assistant messages, render parts
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

          case 'reasoning':
            return showReasoning && part.text ? <ReasoningDisplay key={index} content={part.text} /> : null;

          case 'data':
            // Handle custom data parts
            if (part.data?.type === 'agent-state' || part.data?.type === 'task-progress') {
              // These update global state, no need to render
              return null;
            }
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
            // For unknown part types in dev mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('Unknown message part type:', part);
            }
            return null;
        }
      })}

      {/* Render tool calls/results if any */}
      {message.parts.some((p: any) => p.type === 'tool-call' || p.type === 'tool-result') && (
        <ToolParts parts={message.parts} />
      )}
    </div>
  );
}
