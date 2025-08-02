import { ChatMessage } from '@ui/types';

interface OtherMessageProps {
  message: ChatMessage;
}

export default function OtherMessage({ message }: OtherMessageProps) {
  return <div className="text-sm whitespace-pre-wrap">{message.content}</div>;
}
