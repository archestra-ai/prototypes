import { type TextUIPart, UIMessage } from 'ai';

interface UserMessageProps {
  message: UIMessage;
}

/**
 * TODO: fix the typing issues in this file (also remove the "as" casts)
 */
export default function UserMessage({ message }: UserMessageProps) {
  // Extract text content from parts array (UIMessage in ai SDK v5 uses parts)
  let textContent = '';

  if (message.parts) {
    textContent = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as TextUIPart).text)
      .join('');
  }

  return <div className="text-sm whitespace-pre-wrap">{textContent}</div>;
}
