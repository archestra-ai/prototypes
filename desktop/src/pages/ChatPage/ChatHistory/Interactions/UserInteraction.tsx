// TODO: update this type...
interface UserInteractionProps {
  interaction: any;
}

export default function UserInteraction({ interaction: { content } }: UserInteractionProps) {
  return <div className="text-sm whitespace-pre-wrap">{content.content}</div>;
}
