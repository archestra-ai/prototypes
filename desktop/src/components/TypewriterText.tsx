import { useTypewriter } from '../hooks/use-typewriter';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  className?: string;
}

export function TypewriterText({ text, speed = 30, className }: TypewriterTextProps) {
  const { displayedText, isComplete } = useTypewriter(text, speed);
  return (
    <span className={className}>
      {displayedText}
      {!isComplete && <span className="animate-pulse">|</span>}
    </span>
  );
}
