import { useEffect, useState } from 'react';

export function useTypewriter(text: string, speed: number = 100) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      setIsComplete(false);
      return;
    }

    // Reset when text changes
    setDisplayedText('');
    setIsComplete(false);

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        // Use the character from the current text, not from closure
        setDisplayedText(text.substring(0, currentIndex + 1));
        currentIndex++;

        // Check if we've reached the end
        if (currentIndex >= text.length) {
          clearInterval(interval);
          setIsComplete(true);
        }
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayedText, isComplete };
}
