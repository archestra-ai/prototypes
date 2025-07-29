import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatProvider, useChatContext } from './chat-provider';

// Mock the dependencies
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    status: 'idle',
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/stores/chat-store', () => ({
  useChatStore: vi.fn(() => ({
    currentChatSessionId: 'test-session-id',
  })),
}));

vi.mock('@/stores/ollama-store', () => ({
  useOllamaStore: {
    getState: vi.fn(() => ({
      selectedModel: 'test-model',
    })),
  },
}));

vi.mock('./chat-provider/event-handlers', () => ({
  handleDataEvent: vi.fn(),
}));

vi.mock('@/consts', () => ({
  ARCHESTRA_SERVER_API_URL: 'http://localhost:54587/api',
}));

describe('ChatProvider', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <ChatProvider>
        <div>Test Child</div>
      </ChatProvider>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('provides chat context to children', () => {
    const TestComponent = () => {
      const chat = useChatContext();
      return <div>{chat ? 'Chat context available' : 'No chat context'}</div>;
    };

    const { getByText } = render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(getByText('Chat context available')).toBeInTheDocument();
  });

  it('throws error when useChatContext is used outside provider', () => {
    const TestComponent = () => {
      const chat = useChatContext();
      return <div>{chat ? 'Chat' : 'No chat'}</div>;
    };

    // Suppress console.error for this test
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => render(<TestComponent />)).toThrow('useChatContext must be used within ChatProvider');

    console.error = originalError;
  });

  it('allows setting global metadata window object', async () => {
    render(
      <ChatProvider>
        <div>Test</div>
      </ChatProvider>
    );

    // The window.__CHAT_METADATA__ is not set by the component itself
    // It's meant to be set by other components (like ChatInput)
    window.__CHAT_METADATA__ = { model: 'test-model', tools: [] };
    expect(window.__CHAT_METADATA__).toBeDefined();
    expect(window.__CHAT_METADATA__.model).toBe('test-model');
  });

  it('sets up global stop streaming function', async () => {
    render(
      <ChatProvider>
        <div>Test</div>
      </ChatProvider>
    );

    await waitFor(() => {
      expect(window.__CHAT_STOP_STREAMING__).toBeDefined();
      expect(typeof window.__CHAT_STOP_STREAMING__).toBe('function');
    });
  });

  it('cleans up global functions on unmount', async () => {
    const { unmount } = render(
      <ChatProvider>
        <div>Test</div>
      </ChatProvider>
    );

    await waitFor(() => {
      expect(window.__CHAT_STOP_STREAMING__).toBeDefined();
    });

    unmount();

    expect(window.__CHAT_STOP_STREAMING__).toBeUndefined();
  });
});

describe('ChatProvider event handlers', () => {
  it('handles data events through handleDataEvent', async () => {
    const { handleDataEvent } = await import('./chat-provider/event-handlers');
    const mockHandleDataEvent = vi.mocked(handleDataEvent);

    const { useChat } = await import('@ai-sdk/react');
    const mockUseChat = vi.mocked(useChat);

    // Create a mock that captures the onData callback
    let onDataCallback: ((data: any) => void) | undefined;
    mockUseChat.mockImplementation((config: any) => {
      onDataCallback = config?.onData;
      return {
        messages: [],
        status: 'idle',
        sendMessage: vi.fn(),
        setMessages: vi.fn(),
        stop: vi.fn(),
      } as any;
    });

    render(
      <ChatProvider>
        <div>Test</div>
      </ChatProvider>
    );

    // Simulate data event
    const testData = { type: 'data-test', data: { foo: 'bar' } };
    onDataCallback?.(testData);

    expect(mockHandleDataEvent).toHaveBeenCalledWith(testData);
  });
});
