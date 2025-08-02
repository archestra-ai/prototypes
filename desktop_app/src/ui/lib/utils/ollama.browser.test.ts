import { describe, expect, it } from 'vitest';

import type { ToolWithMCPServerName } from '@ui/types';

import { convertMCPServerToolsToOllamaTools } from './ollama';

describe('ollama utility functions', () => {
  describe('convertMCPServerToolsToOllamaTools', () => {
    it('should convert MCP server tools to Ollama tools format', () => {
      const mockTools: ToolWithMCPServerName[] = [
        {
          name: 'channel_get_history',
          description: 'Get channel history',
          inputSchema: {
            type: 'object',
            properties: {
              channel: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          serverName: 'Slack',
          enabled: true,
        },
        {
          name: 'send_message',
          description: 'Send a message to a channel',
          inputSchema: {
            type: 'object',
            properties: {
              channel: { type: 'string' },
              message: { type: 'string' },
            },
          },
          serverName: 'Slack',
          enabled: true,
        },
        {
          name: 'send_email',
          description: 'Send an email',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string' },
            },
          },
          serverName: 'Gmail',
          enabled: true,
        },
      ];

      const result = convertMCPServerToolsToOllamaTools(mockTools);

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        {
          type: 'Function',
          function: {
            name: 'Slack_channel_get_history',
            description: 'Get channel history',
            parameters: {
              type: 'object',
              properties: {
                channel: { type: 'string' },
                limit: { type: 'number' },
              },
            },
          },
        },
        {
          type: 'Function',
          function: {
            name: 'Slack_send_message',
            description: 'Send a message to a channel',
            parameters: {
              type: 'object',
              properties: {
                channel: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'Function',
          function: {
            name: 'Gmail_send_email',
            description: 'Send an email',
            parameters: {
              type: 'object',
              properties: {
                to: { type: 'string' },
                subject: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
        },
      ]);
    });

    it('should handle tools without description', () => {
      const mockTools: ToolWithMCPServerName[] = [
        {
          name: 'test_tool',
          description: undefined,
          inputSchema: {
            type: 'object',
            properties: {},
          },
          serverName: 'TestServer',
          enabled: true,
        },
      ];

      const result = convertMCPServerToolsToOllamaTools(mockTools);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'Function',
        function: {
          name: 'TestServer_test_tool',
          description: 'Tool from TestServer',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      });
    });

    it('should handle empty tools object', () => {
      const mockTools: ToolWithMCPServerName[] = [];

      const result = convertMCPServerToolsToOllamaTools(mockTools);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });
});
