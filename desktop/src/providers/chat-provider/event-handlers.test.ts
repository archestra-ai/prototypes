import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDataEvent } from './event-handlers';

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
