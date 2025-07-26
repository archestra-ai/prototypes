// TODO: update this type...
interface UserInteractionProps {
  interaction: any;
}

export default function UserInteraction({ interaction }: UserInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{interaction.content}</div>;
}
