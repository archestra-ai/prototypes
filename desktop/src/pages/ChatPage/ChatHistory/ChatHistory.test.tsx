import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatHistory from './index';

// Mock message data
const mockMessages = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, can you help me?',
    parts: [{ type: 'text', text: 'Hello, can you help me?' }],
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: "Of course! I'd be happy to help.",
    parts: [{ type: 'text', text: "Of course! I'd be happy to help." }],
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content: '',
    parts: [
      {
        type: 'text',
        text: '<thinking>\nUser needs help with something.\n</thinking>\n\nI can assist you with various tasks.',
      },
      {
        type: 'tool-test_tool',
        toolCallId: 'tool-1',
        state: 'output-available',
        input: { query: 'test' },
        output: 'Tool result',
        callProviderMetadata: { functionName: 'test_server_test_tool' },
      },
    ],
  },
  {
    id: 'msg-4',
    role: 'system',
    content: 'System message',
    parts: [{ type: 'text', text: 'System message' }],
  },
];

// Mock the stores
vi.mock('@/stores/chat-store', () => ({
  useChatStore: () => ({
    loadChats: vi.fn(),
  }),
}));

// Mock the chat context with hoisted mock
const { mockUseChatContext } = vi.hoisted(() => ({
  mockUseChatContext: vi.fn(),
}));

vi.mock('@/providers/chat-provider', () => ({
  useChatContext: mockUseChatContext,
}));

// Mock the child components
vi.mock('./Messages', () => ({
  UserMessage: ({ message }: any) => <div data-testid="user-message">{message.content}</div>,
  AssistantMessage: ({ message }: any) => <div data-testid="assistant-message">{message.content}</div>,
  OtherMessage: ({ message }: any) => <div data-testid="other-message">{message.content}</div>,
}));

// Mock the auto-scroll hook
vi.mock('./hooks/use-auto-scroll', () => ({
  useAutoScroll: () => ({ scrollAreaId: 'chat-scroll-area' }),
}));

// Mock ToolExecutionResult component
vi.mock('./Messages/ToolExecutionResult', () => ({
  default: ({ toolCall }: any) => (
    <div data-testid="tool-execution-result">{toolCall.result || toolCall.error || 'Tool executing'}</div>
  ),
}));

describe('ChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatContext.mockReturnValue({
      messages: [],
      status: 'idle',
    });
  });

  it('renders without crashing', () => {
    const { container } = render(<ChatHistory />);
    const scrollArea = container.querySelector('#chat-scroll-area');
    expect(scrollArea).toBeInTheDocument();
  });

  it('displays empty state when no messages', () => {
    const { container } = render(<ChatHistory />);
    const messageContainer = container.querySelector('.p-4.space-y-4');
    expect(messageContainer).toBeInTheDocument();
    expect(messageContainer?.children.length).toBe(0);
  });

  it('renders user messages correctly', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[0]],
      status: 'idle',
    });

    render(<ChatHistory />);

    expect(screen.getByTestId('user-message')).toBeInTheDocument();
    expect(screen.getByTestId('user-message')).toHaveTextContent('Hello, can you help me?');
    expect(screen.getByText('user')).toBeInTheDocument();
  });

  it('renders assistant messages correctly', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[1]],
      status: 'idle',
    });

    render(<ChatHistory />);

    expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-message')).toHaveTextContent("Of course! I'd be happy to help.");
    expect(screen.getByText('assistant')).toBeInTheDocument();
  });

  it('renders multiple messages in order', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[0], mockMessages[1]],
      status: 'idle',
    });

    render(<ChatHistory />);

    const messages = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('p-3') && el.classList.contains('rounded-lg'));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent('user');
    expect(messages[1]).toHaveTextContent('assistant');
  });

  it('processes assistant messages with thinking content', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[2]],
      status: 'idle',
    });

    render(<ChatHistory />);

    // Should create two separate message entries: one for text and one for tool
    const messages = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('p-3') && el.classList.contains('rounded-lg'));

    expect(messages).toHaveLength(2);
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
    expect(screen.getByTestId('tool-execution-result')).toBeInTheDocument();
  });

  it('renders system messages correctly', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[3]],
      status: 'idle',
    });

    render(<ChatHistory />);

    expect(screen.getByTestId('other-message')).toBeInTheDocument();
    expect(screen.getByTestId('other-message')).toHaveTextContent('System message');
    expect(screen.getByText('system')).toBeInTheDocument();
  });

  it('handles streaming state correctly', () => {
    const streamingMessage = {
      id: 'msg-streaming',
      role: 'assistant',
      content: 'Streaming...',
      parts: [{ type: 'text', text: 'Streaming...' }],
    };

    mockUseChatContext.mockReturnValue({
      messages: [streamingMessage],
      status: 'streaming',
    });

    render(<ChatHistory />);

    const messages = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('p-3') && el.classList.contains('rounded-lg'));

    expect(messages).toHaveLength(1);
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
  });

  it('applies correct CSS classes to messages', () => {
    mockUseChatContext.mockReturnValue({
      messages: [mockMessages[0], mockMessages[1]],
      status: 'idle',
    });

    const { container } = render(<ChatHistory />);

    const messageElements = container.querySelectorAll('.p-3.rounded-lg');
    expect(messageElements).toHaveLength(2);

    // Check that messages have the base classes
    messageElements.forEach((el) => {
      expect(el.classList.contains('p-3')).toBe(true);
      expect(el.classList.contains('rounded-lg')).toBe(true);
      expect(el.classList.contains('overflow-hidden')).toBe(true);
      expect(el.classList.contains('min-w-0')).toBe(true);
    });
  });

  it('handles tool calls with executing status', () => {
    const executingToolMessage = {
      id: 'msg-tool-executing',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'text', text: 'Executing tool...' },
        {
          type: 'tool-test_tool',
          toolCallId: 'tool-executing',
          state: 'input-available',
          input: { query: 'test' },
          callProviderMetadata: { functionName: 'test_server_test_tool' },
        },
      ],
    };

    mockUseChatContext.mockReturnValue({
      messages: [executingToolMessage],
      status: 'streaming',
    });

    render(<ChatHistory />);

    // Should have both assistant and tool messages
    const messages = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('p-3') && el.classList.contains('rounded-lg'));
    expect(messages).toHaveLength(2);
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
    expect(screen.getByTestId('tool-execution-result')).toBeInTheDocument();
  });

  it('processes messages without parts array gracefully', () => {
    const messageWithoutParts = {
      id: 'msg-no-parts',
      role: 'user',
      content: 'Message without parts',
      // No parts array
    };

    mockUseChatContext.mockReturnValue({
      messages: [messageWithoutParts],
      status: 'idle',
    });

    render(<ChatHistory />);

    expect(screen.getByTestId('user-message')).toBeInTheDocument();
    expect(screen.getByTestId('user-message')).toHaveTextContent('Message without parts');
  });

  it('handles empty content messages', () => {
    const emptyMessage = {
      id: 'msg-empty',
      role: 'assistant',
      content: '',
      parts: [],
    };

    mockUseChatContext.mockReturnValue({
      messages: [emptyMessage],
      status: 'idle',
    });

    render(<ChatHistory />);

    const messages = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('p-3') && el.classList.contains('rounded-lg'));

    expect(messages).toHaveLength(1);
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
  });
});
