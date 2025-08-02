import { describe, expect, it } from 'vitest';

import { convertArchestraToolNameToServerAndToolName, convertServerAndToolNameToArchestraToolName } from './tools';

describe('tools utility functions', () => {
  describe('convertServerAndToolNameToArchestraToolName', () => {
    it('should combine server name and tool name with underscore', () => {
      expect(convertServerAndToolNameToArchestraToolName('Slack', 'channel_get_history')).toBe(
        'Slack_channel_get_history'
      );
    });
  });

  describe('convertOllamaToolNameToServerAndToolName', () => {
    it('should split on first underscore only', () => {
      expect(convertArchestraToolNameToServerAndToolName('Slack_channel_get_history')).toEqual([
        'Slack',
        'channel_get_history',
      ]);
    });

    it('should handle server names with underscores', () => {
      expect(convertArchestraToolNameToServerAndToolName('My_Server_tool_name')).toEqual(['My', 'Server_tool_name']);
      expect(convertArchestraToolNameToServerAndToolName('Test_Server_get_data')).toEqual(['Test', 'Server_get_data']);
    });

    it('should throw error for invalid format (no underscore)', () => {
      expect(() => convertArchestraToolNameToServerAndToolName('InvalidToolName')).toThrow(
        'Invalid tool name format: InvalidToolName. Expected format: serverName_toolName'
      );
    });
  });
});
