import { useCallback, useEffect, useRef, useState } from 'react';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

export const useAutoScroll = (dependencies: any[]) => {
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom when new messages are added or content changes
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current && shouldAutoScroll && !isScrollingRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [shouldAutoScroll]);

  const checkIfAtBottom = useCallback(() => {
    if (!scrollAreaRef.current) {
      return false;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;

    // Consider "at bottom" to be within 10px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    return isAtBottom;
  }, []);

  const handleScroll = useCallback(() => {
    // Mark that user is scrolling
    isScrollingRef.current = true;

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce the scroll end detection
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      const isAtBottom = checkIfAtBottom();
      setShouldAutoScroll(isAtBottom);
    }, 150); // 150ms debounce
  }, [checkIfAtBottom]);

  // Set up scroll area ref and scroll listener
  useEffect(() => {
    const scrollArea = document.querySelector(CHAT_SCROLL_AREA_SELECTOR) as HTMLElement;
    if (scrollArea) {
      scrollAreaRef.current = scrollArea;
      scrollArea.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        scrollArea.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Trigger scroll when dependencies change (only if shouldAutoScroll is true)
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { scrollAreaId: CHAT_SCROLL_AREA_ID };
};
