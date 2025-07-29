import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDataEvent } from './event-handlers';

// Create mock functions using vi.hoisted to avoid hoisting issues
const { mockSetAgentMode, mockStopAgent, mockSetState, mockAddReasoningEntry, mockUpdateProgress } = vi.hoisted(() => ({
  mockSetAgentMode: vi.fn(),
  mockStopAgent: vi.fn(),
  mockSetState: vi.fn(),
  mockAddReasoningEntry: vi.fn(),
  mockUpdateProgress: vi.fn(),
}));

// Mock the agent store
vi.mock('@/stores/agent-store', () => ({
  useAgentStore: {
    getState: () => ({
      setAgentMode: mockSetAgentMode,
      stopAgent: mockStopAgent,
      setState: mockSetState,
      addReasoningEntry: mockAddReasoningEntry,
      updateProgress: mockUpdateProgress,
    }),
    setState: mockSetState,
  },
}));

describe('Event Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleDataEvent', () => {
    it('ignores non-data events', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      handleDataEvent({ type: 'regular-event', data: {} });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('warns about unknown data event types', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      handleDataEvent({ type: 'data-unknown', data: {} });

      expect(consoleSpy).toHaveBeenCalledWith('[ChatProvider] Unknown data event type: unknown');
      consoleSpy.mockRestore();
    });

    describe('agent-state handler', () => {
      it('updates agent mode for planning', () => {
        handleDataEvent({
          type: 'data-agent-state',
          data: { mode: 'planning' },
        });

        expect(mockSetAgentMode).toHaveBeenCalledWith('planning');
      });

      it('updates agent mode for executing', () => {
        handleDataEvent({
          type: 'data-agent-state',
          data: { mode: 'executing' },
        });

        expect(mockSetAgentMode).toHaveBeenCalledWith('executing');
      });

      it('handles completed mode with delayed stop', () => {
        handleDataEvent({
          type: 'data-agent-state',
          data: { mode: 'completed' },
        });

        expect(mockSetAgentMode).toHaveBeenCalledWith('completed');
        expect(mockStopAgent).not.toHaveBeenCalled();

        // Fast-forward time
        vi.advanceTimersByTime(2000);

        expect(mockStopAgent).toHaveBeenCalled();
      });

      it('updates objective when provided', () => {
        handleDataEvent({
          type: 'data-agent-state',
          data: { objective: 'Test objective' },
        });

        expect(mockSetState).toHaveBeenCalledWith({
          currentObjective: 'Test objective',
          isAgentActive: true,
        });
      });
    });

    describe('reasoning handler', () => {
      it('adds reasoning entry when content is provided', () => {
        handleDataEvent({
          type: 'data-reasoning',
          data: {
            content: 'Test reasoning',
            type: 'analysis',
          },
        });

        expect(mockAddReasoningEntry).toHaveBeenCalledWith({
          id: expect.any(String),
          type: 'analysis',
          content: 'Test reasoning',
          confidence: 0.8,
          timestamp: expect.any(Date),
        });
      });

      it('uses default type when not provided', () => {
        handleDataEvent({
          type: 'data-reasoning',
          data: { content: 'Test reasoning' },
        });

        expect(mockAddReasoningEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'planning',
          })
        );
      });

      it('does not add entry when content is missing', () => {
        handleDataEvent({
          type: 'data-reasoning',
          data: {},
        });

        expect(mockAddReasoningEntry).not.toHaveBeenCalled();
      });
    });

    describe('task-progress handler', () => {
      it('updates progress when provided', () => {
        const mockProgress = {
          completed: 5,
          total: 10,
          currentStep: 'Processing',
        };

        handleDataEvent({
          type: 'data-task-progress',
          data: { progress: mockProgress },
        });

        expect(mockUpdateProgress).toHaveBeenCalledWith(mockProgress);
      });

      it('does not update when progress is missing', () => {
        handleDataEvent({
          type: 'data-task-progress',
          data: {},
        });

        expect(mockUpdateProgress).not.toHaveBeenCalled();
      });
    });

    describe('tool-call handler', () => {
      it('logs tool call events', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        handleDataEvent({
          type: 'data-tool-call',
          data: { tool: 'test-tool' },
        });

        expect(consoleSpy).toHaveBeenCalledWith('[ChatProvider] Tool call event:', { tool: 'test-tool' });
        consoleSpy.mockRestore();
      });
    });
  });
});
