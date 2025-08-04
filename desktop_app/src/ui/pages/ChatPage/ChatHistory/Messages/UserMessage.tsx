import { UIMessage } from 'ai';

interface UserMessageProps {
  message: UIMessage;
}

export default function UserMessage({ message }: UserMessageProps) {
  // Extract text content from parts if available, otherwise use content

  let textContent = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text)
    .join('');

  return <div className="text-sm whitespace-pre-wrap">{textContent}</div>;
}
