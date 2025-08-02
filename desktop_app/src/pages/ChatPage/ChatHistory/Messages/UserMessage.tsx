import { ChatMessage } from '@/types';

interface UserMessageProps {
  message: ChatMessage;
}

export default function UserMessage({ message }: UserMessageProps) {
  return <div className="text-sm whitespace-pre-wrap">{message.content}</div>;
}
