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

    // Mock MCP tools with proper structure
    mockMcpTools = {
      // Standard MCP echo tool
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
      // MCP tool for getting current time
      mcp_server_time__getCurrentTime: {
        description: 'Get the current time',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: { type: 'string', description: 'IANA timezone' },
            format: { type: 'string', enum: ['12hr', '24hr'], default: '24hr' },
          },
        },
        execute: vi.fn(async (args: any) => ({
          content: [
            {
              type: 'text',
              text: `Current time in ${args.timezone || 'UTC'}: ${new Date().toLocaleString()}`,
            },
          ],
          isError: false,
        })),
      },
      // MCP tool for file operations
      mcp_server_fs__readFile: {
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
          },
          required: ['path'],
        },
        execute: vi.fn(async (args: any) => {
          if (args.path === '/etc/hosts') {
            return {
              content: [
                {
                  type: 'text',
                  text: '127.0.0.1 localhost\n::1 localhost',
                },
              ],
              isError: false,
            };
          }
          throw new Error(`File not found: ${args.path}`);
        }),
      },
      // MCP tool for calculations
      mcp_server_math__calculate: {
        description: 'Perform mathematical calculations',
        inputSchema: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'Math expression to evaluate' },
          },
          required: ['expression'],
        },
        execute: vi.fn(async (args: any) => {
          try {
            // Simple eval for test purposes (don't use in production!)
            const result = Function('"use strict"; return (' + args.expression + ')')();
            return {
              content: [{ type: 'text', text: `Result: ${result}` }],
              isError: false,
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: Invalid expression` }],
              isError: true,
            };
          }
        }),
      },
      // MCP tool for web requests
      mcp_server_fetch__get: {
        description: 'Make HTTP GET request',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['url'],
        },
        execute: vi.fn(async (args: any) => ({
          content: [
            {
              type: 'text',
              text: `GET ${args.url} returned: {"status": 200, "data": "test response"}`,
            },
          ],
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

  describe('Multi-step tool calling with MCP tools', () => {
    it('should handle single MCP tool call and stop after one step', async () => {
      let callCount = 0;

      // First call returns MCP tool call for getting time
      const firstStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_time__getCurrentTime',
                  arguments: '{"timezone": "America/Los_Angeles", "format": "12hr"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Second call returns just text (no more tools)
      const secondStream = [
        { message: { content: "I've retrieved the current time for you in Los Angeles." } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          return callCount === 1 ? firstStream : secondStream;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      // Should have made 2 calls: one for tool, one for final response
      expect(mockOllama.chat).toHaveBeenCalledTimes(2);

      // MCP tool should have been executed once
      expect(mockMcpTools['mcp_server_time__getCurrentTime'].execute).toHaveBeenCalledTimes(1);
      expect(mockMcpTools['mcp_server_time__getCurrentTime'].execute).toHaveBeenCalledWith({
        timezone: 'America/Los_Angeles',
        format: '12hr',
      });

      // Check logging
      expect(mockFastify.log.info).toHaveBeenCalledWith('Starting step 1 of max 5');
      expect(mockFastify.log.info).toHaveBeenCalledWith('Starting step 2 of max 5');
      expect(mockFastify.log.info).toHaveBeenCalledWith(expect.stringContaining('Step 2 completed, stopping'));
    });

    it('should handle multiple sequential MCP tool calls across steps', async () => {
      let callCount = 0;

      // Step 1: First MCP tool call - calculate something
      const stream1 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "42 * 10"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 2: Second MCP tool call - fetch data
      const stream2 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fetch__get',
                  arguments: '{"url": "https://api.example.com/data"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 3: Third MCP tool call - read file
      const stream3 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fs__readFile',
                  arguments: '{"path": "/etc/hosts"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 4: Final response
      const stream4 = [
        { message: { content: "I've completed all the calculations, fetched the data, and read the file." } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return stream1;
          if (callCount === 2) return stream2;
          if (callCount === 3) return stream3;
          return stream4;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      // Should have made 4 calls
      expect(mockOllama.chat).toHaveBeenCalledTimes(4);

      // All MCP tools should have been executed
      expect(mockMcpTools['mcp_server_math__calculate'].execute).toHaveBeenCalledWith({ expression: '42 * 10' });
      expect(mockMcpTools['mcp_server_fetch__get'].execute).toHaveBeenCalledWith({
        url: 'https://api.example.com/data',
      });
      expect(mockMcpTools['mcp_server_fs__readFile'].execute).toHaveBeenCalledWith({ path: '/etc/hosts' });

      // Verify the conversation context was updated correctly
      const secondCall = mockOllama.chat.mock.calls[1][0];
      expect(secondCall.messages).toHaveLength(3); // Original + assistant + tool result

      const thirdCall = mockOllama.chat.mock.calls[2][0];
      expect(thirdCall.messages).toHaveLength(5); // Previous + assistant + tool result

      const fourthCall = mockOllama.chat.mock.calls[3][0];
      expect(fourthCall.messages).toHaveLength(7); // Previous + assistant + tool result
    });

    it('should stop at MAX_STEPS (5) even if MCP tools keep being called', async () => {
      // Always return an MCP tool call
      const infiniteStream = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "1 + 1"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockResolvedValue(infiniteStream),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      // Should stop at exactly 5 steps
      expect(mockOllama.chat).toHaveBeenCalledTimes(5);
      expect(mockMcpTools['mcp_server_math__calculate'].execute).toHaveBeenCalledTimes(5);

      // Verify proper logging
      for (let i = 1; i <= 5; i++) {
        expect(mockFastify.log.info).toHaveBeenCalledWith(`Starting step ${i} of max 5`);
      }

      expect(mockFastify.log.info).toHaveBeenCalledWith(expect.stringContaining('Step 5 completed, stopping'));
    });

    it('should handle mixed content (text + MCP tools) across steps', async () => {
      let callCount = 0;

      // Step 1: Text + MCP tool call
      const stream1 = [
        { message: { content: 'Let me calculate that for you. ' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "6 * 7"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 2: Another calculation
      const stream2 = [
        { message: { content: 'Now let me verify with another calculation. ' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "42 / 6"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 3: Final text
      const stream3 = [{ message: { content: 'The answer is 42, and when divided by 6 gives us 7.' } }, { done: true }];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return stream1;
          if (callCount === 2) return stream2;
          return stream3;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      // Verify mixed content in steps
      expect(events.some((e) => e.type === 'text-delta' && e.delta?.includes('Let me calculate'))).toBe(true);
      expect(events.some((e) => e.type === 'text-delta' && e.delta?.includes('verify with another calculation'))).toBe(
        true
      );
      expect(events.some((e) => e.type === 'tool-input-start')).toBe(true);

      // Verify final step has concluding text
      expect(events.some((e) => e.type === 'text-delta' && e.delta?.includes('divided by 6 gives us 7'))).toBe(true);

      // MCP tools should have been executed
      expect(mockMcpTools['mcp_server_math__calculate'].execute).toHaveBeenCalledWith({ expression: '6 * 7' });
      expect(mockMcpTools['mcp_server_math__calculate'].execute).toHaveBeenCalledWith({ expression: '42 / 6' });
    });

    it('should handle MCP tool errors and continue to next step', async () => {
      // Override the readFile tool to fail
      mockMcpTools['mcp_server_fs__readFile'].execute = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied: /etc/passwd'));

      let callCount = 0;

      // Step 1: Failing MCP tool
      const stream1 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fs__readFile',
                  arguments: '{"path": "/etc/passwd"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 2: Working MCP tool
      const stream2 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_time__getCurrentTime',
                  arguments: '{"timezone": "UTC"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 3: Final response
      const stream3 = [
        {
          message: { content: "I couldn't read the file due to permissions, but I was able to get the current time." },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return stream1;
          if (callCount === 2) return stream2;
          return stream3;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      const events = parseEvents(capturedEvents);

      // Should continue despite error
      expect(mockOllama.chat).toHaveBeenCalledTimes(3);

      // Error event should be sent
      expect(events.some((e) => e.type === 'tool-output-error' && e.errorText?.includes('Permission denied'))).toBe(
        true
      );

      // Working tool should still be executed
      expect(mockMcpTools['mcp_server_time__getCurrentTime'].execute).toHaveBeenCalled();

      // Final text should be sent
      expect(events.some((e) => e.type === 'text-delta' && e.delta?.includes("couldn't read the file"))).toBe(true);
    });

    it('should properly save messages with all MCP tool calls from all steps', async () => {
      const Chat = await import('@backend/models/chat');

      let callCount = 0;

      const stream1 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "100 / 5"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const stream2 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fetch__get',
                  arguments: '{"url": "https://api.example.com/result"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      const stream3 = [
        { message: { content: "I've completed the calculation and fetched the data successfully." } },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return stream1;
          if (callCount === 2) return stream2;
          return stream3;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      // Verify saveMessages was called with correct structure
      expect(Chat.default.saveMessages).toHaveBeenCalledWith(
        'test-session',
        expect.arrayContaining([
          // Original user message
          expect.objectContaining({ role: 'user' }),
          // Final assistant message with all content and MCP tool calls
          expect.objectContaining({
            role: 'assistant',
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: "I've completed the calculation and fetched the data successfully.",
              }),
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_math__calculate',
              }),
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_fetch__get',
              }),
            ]),
          }),
        ])
      );
    });

    it('should handle complex MCP tool chaining scenario', async () => {
      const Chat = await import('@backend/models/chat');

      // Override some tools for this test
      mockMcpTools['mcp_server_fs__writeFile'] = {
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
        execute: vi.fn(async (args: any) => ({
          content: [{ type: 'text', text: `Written to ${args.path}` }],
          isError: false,
        })),
      };

      let callCount = 0;

      // Step 1: Calculate something
      const stream1 = [
        { message: { content: 'I need to perform some calculations first. ' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_math__calculate',
                  arguments: '{"expression": "1024 * 1024"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 2: Fetch data based on calculation
      const stream2 = [
        { message: { content: 'Now fetching data based on the result. ' } },
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fetch__get',
                  arguments: '{"url": "https://api.example.com/data?size=1048576"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 3: Write results to file
      const stream3 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fs__writeFile',
                  arguments: '{"path": "/tmp/results.txt", "content": "Calculation: 1048576\\nData: fetched"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 4: Read back the file to verify
      const stream4 = [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'mcp_server_fs__readFile',
                  arguments: '{"path": "/etc/hosts"}',
                },
              },
            ],
          },
        },
        { done: true },
      ];

      // Step 5: Final summary
      const stream5 = [
        {
          message: {
            content:
              'Task completed! I calculated 1MB in bytes (1048576), fetched the data, saved it to a file, and verified the system configuration.',
          },
        },
        { done: true },
      ];

      const mockOllama = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return stream1;
          if (callCount === 2) return stream2;
          if (callCount === 3) return stream3;
          if (callCount === 4) return stream4;
          return stream5;
        }),
      };
      vi.mocked(Ollama).mockImplementation(() => mockOllama as any);

      await handleOllamaStream(mockFastify, mockRequest, mockReply, mockMcpTools);

      // Should have made exactly 5 calls (max steps)
      expect(mockOllama.chat).toHaveBeenCalledTimes(5);

      // Verify all tools were called with correct arguments
      expect(mockMcpTools['mcp_server_math__calculate'].execute).toHaveBeenCalledWith({
        expression: '1024 * 1024',
      });
      expect(mockMcpTools['mcp_server_fetch__get'].execute).toHaveBeenCalledWith({
        url: 'https://api.example.com/data?size=1048576',
      });
      expect(mockMcpTools['mcp_server_fs__writeFile'].execute).toHaveBeenCalledWith({
        path: '/tmp/results.txt',
        content: 'Calculation: 1048576\nData: fetched',
      });
      expect(mockMcpTools['mcp_server_fs__readFile'].execute).toHaveBeenCalledWith({
        path: '/etc/hosts',
      });

      // Verify conversation context grows correctly
      const calls = mockOllama.chat.mock.calls;
      expect(calls[0][0].messages).toHaveLength(1); // Initial user message
      expect(calls[1][0].messages).toHaveLength(3); // + assistant + tool result
      expect(calls[2][0].messages).toHaveLength(5); // + assistant + tool result
      expect(calls[3][0].messages).toHaveLength(7); // + assistant + tool result
      expect(calls[4][0].messages).toHaveLength(9); // + assistant + tool result

      // Verify final saved message contains all tools and text
      expect(Chat.default.saveMessages).toHaveBeenCalledWith(
        'test-session',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            parts: expect.arrayContaining([
              // Final text
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('I need to perform some calculations first'),
              }),
              // All tool calls
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_math__calculate',
              }),
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_fetch__get',
              }),
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_fs__writeFile',
              }),
              expect.objectContaining({
                type: 'dynamic-tool',
                toolName: 'mcp_server_fs__readFile',
              }),
            ]),
          }),
        ])
      );

      // Verify proper event sequencing
      const events = parseEvents(capturedEvents);

      // Should have multiple start-step/finish-step pairs
      const startSteps = events.filter((e) => e.type === 'start-step');
      const finishSteps = events.filter((e) => e.type === 'finish-step');
      expect(startSteps.length).toBeGreaterThanOrEqual(8); // At least 8 step events
      expect(finishSteps.length).toBe(startSteps.length); // Balanced pairs

      // Verify text and tool events are properly interleaved
      const textDeltas = events.filter((e) => e.type === 'text-delta');
      const toolInputs = events.filter((e) => e.type === 'tool-input-start');
      expect(textDeltas.length).toBeGreaterThan(0);
      expect(toolInputs.length).toBe(4); // 4 tools executed
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
