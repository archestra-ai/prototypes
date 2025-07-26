// TODO: update this type...
interface OtherInteractionProps {
  interaction: any;
}

export default function OtherInteraction({ interaction }: OtherInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{interaction.content}</div>;
}
