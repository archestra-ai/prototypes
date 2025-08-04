import { UIMessage } from 'ai';

interface UserMessageProps {
  message: UIMessage;
}

export default function UserMessage({ message }: UserMessageProps) {
  // Extract text content from parts if available, otherwise use content

  let textContent =
    Array.isArray(message.parts)
      ? message.parts
          .filter((part) => part.type === 'text')
          .map((part) => (part as { text: string }).text)
          .join('')
      : message.content ?? '';

  return <div className="text-sm whitespace-pre-wrap">{textContent}</div>;
}
