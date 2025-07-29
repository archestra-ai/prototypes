import { describe, expect, it } from 'vitest';

import { ToolCallStatus } from '@/types';

import {
  createToolCall,
  extractStructuredContent,
  extractToolResultText,
  processAssistantMessage,
  processMessages,
  processToolResultPart,
} from './message-processing';

describe('message-processing utilities', () => {
  describe('extractToolResultText', () => {
    it('extracts text from content array structure', () => {
      const part = {
        output: {
          content: [
            { type: 'text', text: 'First line' },
            { type: 'image', data: 'imagedata' },
            { type: 'text', text: 'Second line' },
          ],
        },
      };

      expect(extractToolResultText(part)).toBe('First line\nSecond line');
    });

    it('returns string output directly', () => {
      const part = { output: 'Direct string output' };
      expect(extractToolResultText(part)).toBe('Direct string output');
    });

    it('stringifies object output', () => {
      const part = { output: { key: 'value', nested: { data: 123 } } };
      expect(extractToolResultText(part)).toBe(JSON.stringify(part.output, null, 2));
    });

    it('returns error text when available', () => {
      const part = { errorText: 'Something went wrong' };
      expect(extractToolResultText(part)).toBe('Something went wrong');
    });

    it('returns empty string when no output', () => {
      expect(extractToolResultText({})).toBe('');
    });
  });

  describe('extractStructuredContent', () => {
    it('extracts structured content from output', () => {
      const part = {
        output: {
          content: [
            { type: 'text', text: 'Hello', annotations: ['bold'] },
            { type: 'image', data: 'base64data', mimeType: 'image/png' },
            { type: 'unknown', data: 'ignored' },
          ],
        },
      };

      const result = extractStructuredContent(part);
      expect(result).toHaveLength(2);
      expect(result![0]).toEqual({
        type: 'text',
        text: 'Hello',
        annotations: ['bold'],
      });
      expect(result![1]).toEqual({
        type: 'image',
        data: 'base64data',
        mimeType: 'image/png',
        annotations: undefined,
      });
    });

    it('returns undefined when no content array', () => {
      expect(extractStructuredContent({})).toBeUndefined();
      expect(extractStructuredContent({ output: 'string' })).toBeUndefined();
    });
  });

  describe('processToolResultPart', () => {
    it('updates existing tool call with result', () => {
      const toolCallsMap = new Map();
      const existingCall = {
        id: 'tool-1',
        name: 'test_tool',
        startTime: new Date(Date.now() - 1000),
        status: ToolCallStatus.Executing,
      };
      toolCallsMap.set('tool-1', existingCall);

      const part = {
        output: 'Tool result',
        state: 'output-available',
      };

      processToolResultPart(part, 'tool-1', toolCallsMap);

      const updatedCall = toolCallsMap.get('tool-1');
      expect(updatedCall.result).toBe('Tool result');
      expect(updatedCall.status).toBe(ToolCallStatus.Completed);
      expect(updatedCall.executionTime).toBeGreaterThan(0);
      expect(updatedCall.endTime).toBeInstanceOf(Date);
    });

    it('handles error state', () => {
      const toolCallsMap = new Map();
      const existingCall = {
        id: 'tool-1',
        name: 'test_tool',
        status: ToolCallStatus.Executing,
      };
      toolCallsMap.set('tool-1', existingCall);

      const part = {
        state: 'output-error',
        errorText: 'Tool failed',
      };

      processToolResultPart(part, 'tool-1', toolCallsMap);

      const updatedCall = toolCallsMap.get('tool-1');
      expect(updatedCall.error).toBe('Tool failed');
      expect(updatedCall.status).toBe(ToolCallStatus.Error);
    });

    it('does nothing if tool call not found', () => {
      const toolCallsMap = new Map();
      processToolResultPart({ output: 'result' }, 'non-existent', toolCallsMap);
      expect(toolCallsMap.size).toBe(0);
    });
  });

  describe('createToolCall', () => {
    it('creates tool call from part', () => {
      const part = {
        type: 'tool-Everything_search',
        input: { query: 'test search' },
        callProviderMetadata: { functionName: 'Everything_search' },
      };

      const result = createToolCall(part, 'call-1');

      expect(result).toMatchObject({
        id: 'call-1',
        serverName: 'Everything',
        name: 'search',
        function: {
          name: 'Everything_search',
          arguments: { query: 'test search' },
        },
        arguments: { query: 'test search' },
        status: ToolCallStatus.Executing,
        startTime: expect.any(Date),
      });
    });

    it('handles tool name from type when no metadata', () => {
      const part = {
        type: 'tool-GitHub_createIssue',
        input: { title: 'New issue' },
      };

      const result = createToolCall(part, 'call-2');

      expect(result.serverName).toBe('GitHub');
      expect(result.name).toBe('createIssue');
      expect(result.function.name).toBe('GitHub_createIssue');
    });

    it('handles single part tool names', () => {
      const part = {
        type: 'tool-simplefunction',
        input: {},
      };

      const result = createToolCall(part, 'call-3');

      expect(result.serverName).toBe('simplefunction');
      expect(result.name).toBe('simplefunction');
    });
  });

  describe('processAssistantMessage', () => {
    it('processes simple text message', () => {
      const message = {
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello world' }],
      };

      const result = processAssistantMessage(message, false);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello world',
        thinking: '',
        originalMessageId: 'msg-1',
      });
    });

    it('processes thinking content', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '<think>\nAnalyzing request...\n</think>\n\nHere is my response.',
          },
        ],
      };

      const result = processAssistantMessage(message, false);

      expect(result).toHaveLength(1);
      expect(result[0].thinking).toBe('\nAnalyzing request...\n');
      expect(result[0].content).toBe('Here is my response.');
    });

    it('processes tool calls', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Let me search for that.' },
          {
            type: 'tool-Everything_search',
            toolCallId: 'tool-1',
            state: 'input-available',
            input: { query: 'test' },
          },
          {
            type: 'tool-result',
            toolCallId: 'tool-1',
            state: 'output-available',
            output: 'Search results',
          },
        ],
      };

      const result = processAssistantMessage(message, false);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Let me search for that.');
      expect(result[1].role).toBe('tool');
      expect(result[1].toolCalls![0].result).toBe('Search results');
    });

    it('handles streaming state', () => {
      const message = {
        id: 'msg-5',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Streaming...' }],
        isStreaming: true,
      };

      const result = processAssistantMessage(message, true);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Streaming...');
    });

    it('handles multiple text blocks', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'First part', id: 'block1' },
          { type: 'text', text: ' continued', id: 'block1' },
          { type: 'text', text: 'Second part', id: 'block2' },
        ],
      };

      const result = processAssistantMessage(message, false);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First part continued');
      expect(result[1].content).toBe('Second part');
    });
  });

  describe('processMessages', () => {
    it('processes mixed message types', () => {
      const messages = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi there!' }],
        },
        {
          id: 'msg-3',
          role: 'system',
          content: 'System notification',
          parts: [],
        },
      ];

      const result = processMessages(messages, false);

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
      expect(result[1].role).toBe('assistant');
      expect(result[1].content).toBe('Hi there!');
      expect(result[2].role).toBe('system');
      expect(result[2].content).toBe('System notification');
    });

    it('handles messages without parts gracefully', () => {
      const messages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'No parts array',
        },
      ];

      const result = processMessages(messages, false);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('No parts array');
    });

    it('processes assistant messages with tools', () => {
      const messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Let me help' },
            {
              type: 'tool-Test_function',
              toolCallId: 'tool-1',
              state: 'input-available',
              input: {},
            },
          ],
        },
      ];

      const result = processMessages(messages, false);

      // Should split into text and tool messages
      expect(result.length).toBeGreaterThan(1);
      expect(result.some((m) => m.role === 'assistant')).toBe(true);
      expect(result.some((m) => m.role === 'tool')).toBe(true);
    });

    it('maintains message order', () => {
      const messages = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'First' }] },
        { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'Second' }] },
        { id: '3', role: 'user', parts: [{ type: 'text', text: 'Third' }] },
      ];

      const result = processMessages(messages, false);

      expect(result.map((m) => m.content)).toEqual(['First', 'Second', 'Third']);
    });
  });
});
