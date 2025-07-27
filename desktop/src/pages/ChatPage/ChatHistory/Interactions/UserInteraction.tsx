import { ChatInteraction } from '@/types';

interface UserInteractionProps {
  interaction: ChatInteraction;
}

export default function UserInteraction({ interaction }: UserInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{interaction.content}</div>;
}
