import { UIMessage } from 'ai';

interface OtherMessageProps {
  message: UIMessage;
}

export default function OtherMessage({ message }: OtherMessageProps) {
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

  return <div className="text-sm whitespace-pre-wrap">{textContent}</div>;
}
