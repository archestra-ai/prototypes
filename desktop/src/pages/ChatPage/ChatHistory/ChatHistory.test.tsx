import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../../../stores/agent-store';
import { useChatStore } from '../../../stores/chat-store';
import ChatHistory from './index';

// Mock the stores
vi.mock('../../../stores/chat-store');
vi.mock('../../../stores/agent-store');

// Mock the UI components
vi.mock('../../../components/ui/scroll-area', () => ({
  ScrollArea: ({ children, id }: any) => (
    <div id={id} data-testid="scroll-area">
      {children}
    </div>
  ),
}));

vi.mock('../../../components/kibo/ai-response', () => ({
  AIResponse: ({ children }: any) => <div data-testid="ai-response">{children}</div>,
}));

vi.mock('../../../components/kibo/ai-reasoning', () => ({
  AIReasoning: ({ children }: any) => <div data-testid="ai-reasoning">{children}</div>,
  AIReasoningTrigger: () => <button data-testid="ai-reasoning-trigger">Show reasoning</button>,
  AIReasoningContent: ({ children }: any) => <div data-testid="ai-reasoning-content">{children}</div>,
}));

vi.mock('../ToolCallIndicator', () => ({
  default: ({ toolCalls, isExecuting }: any) => (
    <div data-testid="tool-call-indicator">
      {isExecuting && (
        <span>
          Executing {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  ),
}));

describe('ChatHistory', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementations
    (useChatStore as any).mockReturnValue({
      chatHistory: [],
    });

    (useAgentStore as any).mockReturnValue({
      mode: 'idle',
      plan: null,
      reasoningMode: 'verbose',
      currentObjective: null,
    });
  });

  it('renders empty chat history', () => {
    render(<ChatHistory />);
    expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
  });

  it('renders user and assistant messages', () => {
    (useChatStore as any).mockReturnValue({
      chatHistory: [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date(),
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date(),
        },
      ],
    });

    render(<ChatHistory />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('shows agent mode indicator when agent is active', () => {
    (useAgentStore as any).mockReturnValue({
      mode: 'executing',
      plan: null,
      reasoningMode: 'verbose',
      currentObjective: 'Test objective',
    });

    render(<ChatHistory />);

    expect(screen.getByText(/Agent Mode:/)).toBeInTheDocument();
    expect(screen.getByText('Executing')).toBeInTheDocument();
    expect(screen.getByText('Test objective')).toBeInTheDocument();
  });

  it('renders tool calls with indicator', () => {
    (useChatStore as any).mockReturnValue({
      chatHistory: [
        {
          id: '1',
          role: 'assistant',
          content: 'Let me help you with that.',
          toolCalls: [
            {
              id: 'tc1',
              serverName: 'test',
              toolName: 'calculator',
              arguments: { a: 1, b: 2 },
              status: 'executing',
              startTime: new Date(),
            },
          ],
          isToolExecuting: true,
          timestamp: new Date(),
        },
      ],
    });

    render(<ChatHistory />);

    expect(screen.getByText('Let me help you with that.')).toBeInTheDocument();
    expect(screen.getByText(/Executing.*tool/)).toBeInTheDocument();
  });

  it('renders reasoning content when in verbose mode', () => {
    (useChatStore as any).mockReturnValue({
      chatHistory: [
        {
          id: '1',
          role: 'assistant',
          content: 'Here is my response.',
          thinkingContent: 'This is my reasoning process...',
          timestamp: new Date(),
        },
      ],
    });

    render(<ChatHistory />);

    expect(screen.getByText('Here is my response.')).toBeInTheDocument();
    expect(screen.getByTestId('ai-reasoning')).toBeInTheDocument();
    expect(screen.getByText('This is my reasoning process...')).toBeInTheDocument();
  });

  it('shows loading indicator for streaming messages', () => {
    (useChatStore as any).mockReturnValue({
      chatHistory: [
        {
          id: '1',
          role: 'assistant',
          content: 'Partial response...',
          isStreaming: true,
          timestamp: new Date(),
        },
      ],
    });

    render(<ChatHistory />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
