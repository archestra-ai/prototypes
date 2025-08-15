import { FastifyReply, FastifyRequest } from 'fastify';
import { Ollama } from 'ollama';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleOllamaStream } from './ollama-stream-handler';

// Mock dependencies
vi.mock('ollama');
vi.mock('@backend/config', () => ({
  default: {
    ollama: {
      server: {
        host: 'http://localhost:11434',
      },
    },
  },
}));
vi.mock('@backend/models/chat', () => ({
  default: {
    saveMessages: vi.fn(),
  },
}));

describe('handleOllamaStream', () => {
  let mockFastify: any;
  let mockRequest: FastifyRequest<{ Body: any }>;
  let mockReply: FastifyReply;
  let mockRawResponse: any;
  let capturedEvents: string[];
  let mockMcpTools: any;

  beforeEach(() => {
    capturedEvents = [];

    // Mock raw response
    mockRawResponse = {
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      write: vi.fn((data: string) => {
        capturedEvents.push(data);
      }),
      end: vi.fn(),
    };

    // Mock Fastify instance
    mockFastify = {
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    // Mock request
    mockRequest = {
      body: {
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }],
          },
        ],
        sessionId: 'test-session',
        model: 'llama3.1:8b',
      },
    } as any;

    // Mock reply
    mockReply = {
      hijack: vi.fn(),
      raw: mockRawResponse,
      sent: false,
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    // Mock MCP tools
    mockMcpTools = {
      echo: {
        description: 'Echo the message',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
        execute: vi.fn(async (args: any) => ({
          content: [{ type: 'text', text: `Echo: ${args.message}` }],
          isError: false,
        })),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const parseEvents = (events: string[]): any[] => {
    return events
      .filter((e) => e.startsWith('data: '))
      .map((e) => {
        const jsonStr = e.replace('data: ', '').replace(/\n+$/, '');
        try {
          return JSON.parse(jsonStr);
        } catch (err) {
          console.error('Failed to parse JSON:', jsonStr);
          console.error('Raw event:', e);
          throw err;
        }
      });
  };

  describe('Text-only streaming', () => {
    it('should handle simple text response', async () => {
      const mockStream = [
        { message: { content: 'Hello' } },
        { message: { content: ' there' } },
        { message: { content: '!' } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      // Verify event sequence
      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'Hello' });
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: ' there' });
      expect(events[5]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '!' });
      expect(events[6]).toMatchObject({ type: 'text-end' });
      expect(events[7]).toEqual({ type: 'finish-step' });
      expect(events[8]).toEqual({ type: 'finish' });
    });

    it('should skip empty/whitespace-only content', async () => {
      const mockStream = [
        { message: { content: 'Hello' } },
        { message: { content: '   ' } }, // Whitespace only - should be skipped for text-start but included in delta
        { message: { content: '\n\n' } }, // Whitespace only - should be skipped for text-start but included in delta
        { message: { content: 'World' } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'Hello' });
      // Whitespace should still be sent as deltas if text has started
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '   ' });
      expect(events[5]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '\n\n' });
      expect(events[6]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'World' });
      expect(events[7]).toMatchObject({ type: 'text-end' });
      expect(events[8]).toEqual({ type: 'finish-step' });
      expect(events[9]).toEqual({ type: 'finish' });
    });

    it('should handle think blocks in text', async () => {
      const mockStream = [
        { message: { content: '<think>' } },
        { message: { content: 'This is my thought process' } },
        { message: { content: '</think>' } },
        { message: { content: '\n\nHere is my answer' } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '<think>' });
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'This is my thought process' });
      expect(events[5]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '</think>' });
      expect(events[6]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '\n\nHere is my answer' });
      expect(events[7]).toMatchObject({ type: 'text-end' });
      expect(events[8]).toEqual({ type: 'finish-step' });
      expect(events[9]).toEqual({ type: 'finish' });
    });
  });

  describe('Tool-only streaming', () => {
    it('should handle tool call without text', async () => {
      const mockStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Hello"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      console.log('Captured events for tool-only test:', capturedEvents);
      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({
        type: 'tool-input-start',
        toolCallId: expect.any(String),
        toolName: 'echo',
        dynamic: true,
      });
      expect(events[3]).toMatchObject({
        type: 'tool-input-delta',
        toolCallId: expect.any(String),
        inputTextDelta: '{"message":"Hello"}',
      });
      expect(events[4]).toMatchObject({
        type: 'tool-input-available',
        toolCallId: expect.any(String),
        toolName: 'echo',
        input: { message: 'Hello' },
        dynamic: true,
      });
      expect(events[5]).toMatchObject({
        type: 'tool-output-available',
        toolCallId: expect.any(String),
        output: {
          content: [{ type: 'text', text: 'Echo: Hello' }],
          isError: false,
        },
        dynamic: true,
      });
      expect(events[6]).toEqual({ type: 'finish-step' });
      expect(events[7]).toEqual({ type: 'finish' });
    });

    it('should handle multiple tool calls', async () => {
      const mockStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"First"}',
                },
              },
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Second"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });

      // First tool call - wrapped in step events
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'tool-input-start', toolName: 'echo', dynamic: true });
      expect(events[3]).toMatchObject({ type: 'tool-input-delta', inputTextDelta: '{"message":"First"}' });
      expect(events[4]).toMatchObject({ type: 'tool-input-available', input: { message: 'First' }, dynamic: true });
      expect(events[5]).toMatchObject({ type: 'tool-output-available', dynamic: true });
      expect(events[6]).toEqual({ type: 'finish-step' });

      // Second tool call - wrapped in step events
      expect(events[7]).toEqual({ type: 'start-step' });
      expect(events[8]).toMatchObject({ type: 'tool-input-start', toolName: 'echo', dynamic: true });
      expect(events[9]).toMatchObject({ type: 'tool-input-delta', inputTextDelta: '{"message":"Second"}' });
      expect(events[10]).toMatchObject({ type: 'tool-input-available', input: { message: 'Second' }, dynamic: true });
      expect(events[11]).toMatchObject({ type: 'tool-output-available', dynamic: true });
      expect(events[12]).toEqual({ type: 'finish-step' });

      expect(events[13]).toEqual({ type: 'finish' });
    });
  });

  describe('Mixed text and tool streaming', () => {
    it('should send text-end before tool-input-start', async () => {
      const mockStream = [
        { message: { content: 'Let me help you with that.' } },
        { message: { content: '\n\n' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Hello"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'Let me help you with that.' });
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '\n\n' });
      expect(events[5]).toMatchObject({ type: 'text-end' }); // Should come before finish-step
      expect(events[6]).toEqual({ type: 'finish-step' }); // Finish text step
      expect(events[7]).toEqual({ type: 'start-step' }); // Start tool step
      expect(events[8]).toMatchObject({ type: 'tool-input-start', toolName: 'echo', dynamic: true });
      expect(events[9]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[10]).toMatchObject({ type: 'tool-input-available', dynamic: true });
      expect(events[11]).toMatchObject({ type: 'tool-output-available', dynamic: true });
      expect(events[12]).toEqual({ type: 'finish-step' });
      expect(events[13]).toEqual({ type: 'finish' });
    });

    it('should handle text with think block followed by tool call', async () => {
      const mockStream = [
        { message: { content: '<think>' } },
        { message: { content: 'I need to use a tool for this' } },
        { message: { content: '</think>' } },
        { message: { content: '\n\n' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Hi"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '<think>' });
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'I need to use a tool for this' });
      expect(events[5]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '</think>' });
      expect(events[6]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '\n\n' });
      expect(events[7]).toMatchObject({ type: 'text-end' }); // Must come before finish-step
      expect(events[8]).toEqual({ type: 'finish-step' }); // Finish text step
      expect(events[9]).toEqual({ type: 'start-step' }); // Start tool step
      expect(events[10]).toMatchObject({ type: 'tool-input-start', dynamic: true });
      expect(events[11]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[12]).toMatchObject({ type: 'tool-input-available', dynamic: true });
      expect(events[13]).toMatchObject({ type: 'tool-output-available', dynamic: true });
      expect(events[14]).toEqual({ type: 'finish-step' });
      expect(events[15]).toEqual({ type: 'finish' });
    });

    it('should handle tool execution at chunk.done', async () => {
      const mockStream = [
        { message: { content: 'Processing your request' } },
        { message: { content: '...' } },
        // Tool calls might be accumulated but executed on done
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Test"}',
                },
              },
            ],
          },
          done: true,
        },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'Processing your request' });
      expect(events[4]).toEqual({ type: 'text-delta', id: expect.any(String), delta: '...' });
      expect(events[5]).toMatchObject({ type: 'text-end' }); // Should close text
      expect(events[6]).toEqual({ type: 'finish-step' }); // Finish text step
      expect(events[7]).toEqual({ type: 'start-step' }); // Start tool step
      expect(events[8]).toMatchObject({ type: 'tool-input-start' });
      expect(events[9]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[10]).toMatchObject({ type: 'tool-input-available', dynamic: true });
      expect(events[11]).toMatchObject({ type: 'tool-output-available', dynamic: true });
      expect(events[12]).toEqual({ type: 'finish-step' });
      expect(events[13]).toEqual({ type: 'finish' });
    });
  });

  describe('Error handling', () => {
    it('should handle tool execution errors', async () => {
      const mockStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: '{"message":"Error test"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Make tool execution fail
      mockMcpTools.echo.execute = vi.fn().mockRejectedValue(new Error('Tool failed'));

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'tool-input-start', dynamic: true });
      expect(events[3]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[4]).toMatchObject({ type: 'tool-input-available', dynamic: true });
      expect(events[5]).toMatchObject({
        type: 'tool-output-error',
        toolCallId: expect.any(String),
        errorText: 'Tool failed',
      });
      expect(events[6]).toEqual({ type: 'finish-step' });
      expect(events[7]).toEqual({ type: 'finish' });
    });

    it('should handle invalid tool arguments', async () => {
      const mockStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'echo',
                  arguments: 'invalid json',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'tool-input-start', dynamic: true });
      expect(events[3]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[4]).toMatchObject({
        type: 'tool-output-error',
        toolCallId: expect.any(String),
        errorText: 'Invalid tool arguments',
      });
      expect(events[5]).toEqual({ type: 'finish-step' });
      expect(events[6]).toEqual({ type: 'finish' });
    });

    it('should handle unknown tool', async () => {
      const mockStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'unknown_tool',
                  arguments: '{}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'tool-input-start', dynamic: true });
      expect(events[3]).toMatchObject({ type: 'tool-input-delta' });
      expect(events[4]).toMatchObject({ type: 'tool-input-available', dynamic: true });
      expect(events[5]).toMatchObject({
        type: 'tool-output-error',
        toolCallId: expect.any(String),
        errorText: 'Tool unknown_tool not found',
      });
      expect(events[6]).toEqual({ type: 'finish-step' });
      expect(events[7]).toEqual({ type: 'finish' });
    });

    it('should handle stream errors', async () => {
      const mockOllama = {
        chat: vi.fn().mockRejectedValue(new Error('Stream failed')),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      expect(mockFastify.log.error).toHaveBeenCalledWith(
        'Ollama streaming error:',
        expect.objectContaining({
          message: 'Stream failed',
        })
      );
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to stream response',
        details: 'Stream failed',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty stream', async () => {
      const mockStream = [{ done: true }];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'finish' });
    });

    it('should handle no MCP tools available', async () => {
      const mockStream = [{ message: { content: 'Hello without tools' } }, { done: true }];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, null);

      expect(mockFastify.log.warn).toHaveBeenCalledWith('No MCP tools available for Ollama');

      const events = parseEvents(capturedEvents);
      expect(events[0]).toEqual({ type: 'start' });
      expect(events[1]).toEqual({ type: 'start-step' });
      expect(events[2]).toMatchObject({ type: 'text-start' });
      expect(events[3]).toEqual({ type: 'text-delta', id: expect.any(String), delta: 'Hello without tools' });
      expect(events[4]).toMatchObject({ type: 'text-end' });
      expect(events[5]).toEqual({ type: 'finish-step' });
      expect(events[6]).toEqual({ type: 'finish' });
    });

    it('should not save messages when sessionId is missing', async () => {
      const Chat = await import('@backend/models/chat');

      (mockRequest.body as any).sessionId = undefined;

      const mockStream = [{ message: { content: 'Test' } }, { done: true }];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(mockStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      expect(Chat.default.saveMessages).not.toHaveBeenCalled();
    });
  });
});
