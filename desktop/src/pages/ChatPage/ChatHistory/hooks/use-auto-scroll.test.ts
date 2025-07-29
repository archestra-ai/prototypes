import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoScroll } from './use-auto-scroll';

type TestProps = { deps: any[] };

describe('useAutoScroll', () => {
  let mockScrollArea: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create a mock scroll area element
    mockScrollArea = document.createElement('div');
    mockScrollArea.setAttribute('data-radix-scroll-area-viewport', 'true');

    // Set up scroll properties
    Object.defineProperty(mockScrollArea, 'scrollHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(mockScrollArea, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(mockScrollArea, 'clientHeight', {
      configurable: true,
      value: 500,
    });

    // Mock scrollTo method
    mockScrollArea.scrollTo = vi.fn();

    // Create container with the expected ID
    const container = document.createElement('div');
    container.id = 'chat-scroll-area';
    container.appendChild(mockScrollArea);
    document.body.appendChild(container);

    // Mock querySelector to return our mock element
    const originalQuerySelector = document.querySelector;
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === '#chat-scroll-area [data-radix-scroll-area-viewport]') {
        return mockScrollArea;
      }
      return originalQuerySelector.call(document, selector);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns the correct scroll area ID', () => {
    const { result } = renderHook(() => useAutoScroll([]));
    expect(result.current.scrollAreaId).toBe('chat-scroll-area');
  });

  it('scrolls to bottom when dependencies change', () => {
    renderHook(() => useAutoScroll(['message1']));

    // Wait for the initial timeout
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockScrollArea.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: 'smooth',
    });

    // Clear the mock
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Re-render with new dependencies
    renderHook(() => useAutoScroll(['message1', 'message2']));

    // Wait for the scroll timeout
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockScrollArea.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: 'smooth',
    });
  });

  it('disables auto-scroll when user scrolls away from bottom', () => {
    const { rerender } = renderHook((props: TestProps) => useAutoScroll(props.deps), { initialProps: { deps: [] } });

    // Wait for initial mount
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Clear initial scroll
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Set scroll position away from bottom
    Object.defineProperty(mockScrollArea, 'scrollTop', { value: 200, configurable: true });

    // Simulate scroll event
    const scrollEvent = new Event('scroll');
    act(() => {
      mockScrollArea.dispatchEvent(scrollEvent);
    });

    // Wait for debounce
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Clear any calls
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Trigger a dependency change
    rerender({ deps: ['new message'] });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Should not scroll because user scrolled away
    expect(mockScrollArea.scrollTo).not.toHaveBeenCalled();
  });

  it('re-enables auto-scroll when user scrolls to bottom', () => {
    renderHook(() => useAutoScroll([]));

    // First, scroll away from bottom
    Object.defineProperty(mockScrollArea, 'scrollTop', { value: 200 });

    const scrollEvent1 = new Event('scroll');
    act(() => {
      mockScrollArea.dispatchEvent(scrollEvent1);
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Now scroll to bottom (within 10px threshold)
    Object.defineProperty(mockScrollArea, 'scrollTop', { value: 495 });

    const scrollEvent2 = new Event('scroll');
    act(() => {
      mockScrollArea.dispatchEvent(scrollEvent2);
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Clear previous calls
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Trigger a dependency change
    renderHook(() => useAutoScroll(['another message']));

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Should scroll because user is at bottom
    expect(mockScrollArea.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: 'smooth',
    });
  });

  it('handles missing scroll area gracefully', () => {
    // Mock querySelector to return null
    vi.mocked(document.querySelector).mockReturnValue(null);

    const { result } = renderHook(() => useAutoScroll([]));

    // Should still return the scroll area ID
    expect(result.current.scrollAreaId).toBe('chat-scroll-area');

    // No errors should be thrown
    act(() => {
      vi.advanceTimersByTime(50);
    });
  });

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(mockScrollArea, 'removeEventListener');

    const { unmount } = renderHook(() => useAutoScroll([]));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('debounces scroll events correctly', () => {
    const { rerender } = renderHook((props: TestProps) => useAutoScroll(props.deps), { initialProps: { deps: [] } });

    // Wait for initial mount
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Clear initial scroll
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Set initial position at bottom
    Object.defineProperty(mockScrollArea, 'scrollTop', { value: 500, configurable: true });

    // Dispatch multiple scroll events quickly
    const scrollEvent = new Event('scroll');

    act(() => {
      mockScrollArea.dispatchEvent(scrollEvent);
      vi.advanceTimersByTime(50);
      mockScrollArea.dispatchEvent(scrollEvent);
      vi.advanceTimersByTime(50);
      mockScrollArea.dispatchEvent(scrollEvent);
    });

    // Scroll away from bottom during debounce
    Object.defineProperty(mockScrollArea, 'scrollTop', { value: 200, configurable: true });

    // Complete the debounce
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Clear any calls
    vi.mocked(mockScrollArea.scrollTo).mockClear();

    // Now trigger a dependency change
    rerender({ deps: ['test'] });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Should not scroll because we're away from bottom
    expect(mockScrollArea.scrollTo).not.toHaveBeenCalled();
  });
});
