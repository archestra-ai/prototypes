import { ChatMessage } from '@/types';

export const getMessageClassName = (message: ChatMessage | { role: string }) => {
  switch (message.role) {
    case 'user':
      return 'bg-primary/10 border border-primary/20 ml-8';
    case 'assistant':
      return 'bg-secondary/50 border border-secondary mr-8';
    case 'system':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600';
    case 'tool':
      return 'bg-blue-500/10 border border-blue-500/20 text-blue-600';
    default:
      return 'bg-muted border';
  }
};
