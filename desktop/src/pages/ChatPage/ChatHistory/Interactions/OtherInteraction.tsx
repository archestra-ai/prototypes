import { ChatInteraction } from '@/types';

interface OtherInteractionProps {
  interaction: ChatInteraction;
}

export default function OtherInteraction({ interaction }: OtherInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{interaction.content}</div>;
}
