import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ChatHistory from './index';

// Mock the stores
vi.mock('@/stores/chat-store', () => ({
  useChatStore: () => ({
    loadChats: vi.fn(),
  }),
}));

// Mock the useChat hook
vi.mock('@/hooks/use-sse-chat', () => ({
  useSSEChat: () => ({
    messages: [],
    status: 'idle',
  }),
}));

// Mock the chat context
vi.mock('@/providers/chat-provider', () => ({
  useChatContext: () => ({
    messages: [],
    status: 'idle',
  }),
}));

describe('ChatHistory', () => {
  it('renders without crashing', () => {
    render(<ChatHistory />);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  // TODO: Add more tests when the new chat architecture is stable
});
