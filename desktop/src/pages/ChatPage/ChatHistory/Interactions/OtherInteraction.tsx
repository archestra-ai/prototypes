// TODO: update this type...
interface OtherInteractionProps {
  interaction: any;
}

export default function OtherInteraction({ interaction: { content } }: OtherInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{content}</div>;
}
