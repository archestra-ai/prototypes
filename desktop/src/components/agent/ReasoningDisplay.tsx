interface ReasoningDisplayProps {
  content: string;
}

export function ReasoningDisplay({ content }: ReasoningDisplayProps) {
  return (
    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
      <p className="text-sm text-blue-700 dark:text-blue-300">{content}</p>
    </div>
  );
}
