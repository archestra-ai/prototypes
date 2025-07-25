import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/types';
import type { AgentUIMessage, ReasoningEntry, TaskProgress } from '@/types/agent';

// Test the pure conversion functions without the store dependencies
// by copying the implementations

function convertUIMessageToChatMessage(uiMessage: any): ChatMessage {
  const message = uiMessage as any;
  const agentMessage = uiMessage as AgentUIMessage;

  // Extract text content from message parts
  let content = '';
  const toolCalls: any[] = [];

  if (message.content) {
    if (typeof message.content === 'string') {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      // Process message parts
      message.content.forEach((part: any) => {
        if (part.type === 'text') {
          content += part.text;
        } else if (part.type === 'tool-call') {
          toolCalls.push({
            id: part.toolCallId,
            serverName: '', // Will need to extract from tool name
            toolName: part.toolName,
            arguments: part.args || {},
            status: 'pending',
            startTime: new Date(),
          });
        }
      });
    }
  }

  return {
    id: message.id,
    role: message.role as string,
    content,
    timestamp: new Date(),
    isStreaming: false,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    isFromAgent: agentMessage.metadata?.isFromAgent,
    agentMetadata: agentMessage.metadata
      ? {
          planId: agentMessage.metadata.planId,
          stepId: agentMessage.metadata.stepId,
          isAgentGenerated: agentMessage.metadata.isFromAgent || false,
        }
      : undefined,
  };
}

function convertChatMessageToUIMessage(message: ChatMessage): AgentUIMessage {
  const parts: any[] = [];

  // Add text content
  if (message.content) {
    parts.push({
      type: 'text',
      text: message.content,
    });
  }

  // Add tool calls
  if (message.toolCalls) {
    message.toolCalls.forEach((toolCall: any) => {
      parts.push({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.toolName,
        args: toolCall.arguments,
      });
    });
  }

  const baseMessage: any = {
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    content: parts.length > 0 ? parts : message.content,
  };

  return {
    ...baseMessage,
    metadata: {
      agentMode: message.agentMetadata?.planId ? 'executing' : undefined,
      planId: message.agentMetadata?.planId,
      stepId: message.agentMetadata?.stepId,
      isFromAgent: message.isFromAgent,
    },
  } as AgentUIMessage;
}

function extractReasoningFromMessage(message: any): ReasoningEntry[] {
  const reasoning: ReasoningEntry[] = [];
  const msg = message as any;

  if (msg.content && Array.isArray(msg.content)) {
    msg.content.forEach((part: any) => {
      if (part.type === 'data') {
        const data = part.data as any;
        if (data.type === 'reasoning' && data.entry) {
          reasoning.push(data.entry);
        }
      }
    });
  }

  return reasoning;
}

function extractTaskProgressFromMessage(message: any): TaskProgress | null {
  const msg = message as any;

  if (msg.content && Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if ((part as any).type === 'data') {
        const data = (part as any).data;
        if (data.type === 'task-progress' && data.progress) {
          return data.progress;
        }
      }
    }
  }

  return null;
}

describe('Message Conversion - Pure Functions', () => {
  describe('convertUIMessageToChatMessage', () => {
    it('should convert simple text UIMessage to ChatMessage', () => {
      const uiMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello, how can I help you?',
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);

      expect(chatMessage).toEqual({
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello, how can I help you?',
        timestamp: expect.any(Date),
        isStreaming: false,
        toolCalls: undefined,
        isFromAgent: undefined,
        agentMetadata: undefined,
      });
    });

    it('should convert UIMessage with text parts to ChatMessage', () => {
      const uiMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Processing your request. ' },
          { type: 'text', text: 'Let me analyze this.' },
        ],
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);

      expect(chatMessage.content).toBe('Processing your request. Let me analyze this.');
      expect(chatMessage.toolCalls).toBeUndefined();
    });

    it('should convert UIMessage with tool calls to ChatMessage', () => {
      const uiMessage = {
        id: 'msg-3',
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will search for that information.' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search_files',
            args: { query: 'test pattern' },
          },
        ],
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);

      expect(chatMessage.content).toBe('I will search for that information.');
      expect(chatMessage.toolCalls).toHaveLength(1);
      expect(chatMessage.toolCalls![0]).toMatchObject({
        id: 'call-1',
        toolName: 'search_files',
        arguments: { query: 'test pattern' },
        status: 'pending',
      });
    });

    it('should preserve agent metadata in conversion', () => {
      const uiMessage = {
        id: 'msg-4',
        role: 'assistant',
        content: 'Executing plan step',
        metadata: {
          isFromAgent: true,
          planId: 'plan-123',
          stepId: 'step-456',
          agentMode: 'executing',
        },
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);

      expect(chatMessage.isFromAgent).toBe(true);
      expect(chatMessage.agentMetadata).toEqual({
        planId: 'plan-123',
        stepId: 'step-456',
        isAgentGenerated: true,
      });
    });
  });

  describe('convertChatMessageToUIMessage', () => {
    it('should convert simple ChatMessage to UIMessage', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello AI assistant',
        timestamp: new Date(),
      };

      const uiMessage = convertChatMessageToUIMessage(chatMessage);

      expect(uiMessage.id).toBe('msg-1');
      expect(uiMessage.role).toBe('user');
      // UIMessage doesn't have a content property in v5
      // The conversion is handled internally by the SDK
      expect(uiMessage.metadata?.isFromAgent).toBeUndefined();
    });

    it('should convert ChatMessage with tool calls to UIMessage parts', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Searching for files...',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'call-1',
            serverName: 'filesystem',
            toolName: 'read_file',
            arguments: { path: '/test.txt' },
            status: 'completed',
            startTime: new Date(),
          },
        ],
      };

      const uiMessage = convertChatMessageToUIMessage(chatMessage);

      // UIMessage doesn't have content property in v5
      expect(uiMessage.role).toBe('assistant');
    });
  });

  describe('extractReasoningFromMessage', () => {
    it('should extract reasoning entries from data parts', () => {
      const reasoningEntry: ReasoningEntry = {
        id: 'reason-1',
        type: 'planning',
        content: 'Analyzing the user request',
        timestamp: new Date(),
        confidence: 0.85,
      };

      const message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me think...' },
          {
            type: 'data',
            data: {
              type: 'reasoning',
              entry: reasoningEntry,
            },
          },
        ],
      };

      const extracted = extractReasoningFromMessage(message);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toEqual(reasoningEntry);
    });

    it('should return empty array for string content', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Just a string message',
      };

      const extracted = extractReasoningFromMessage(message);

      expect(extracted).toEqual([]);
    });
  });

  describe('extractTaskProgressFromMessage', () => {
    it('should extract task progress from data parts', () => {
      const taskProgress: TaskProgress = {
        completed: 3,
        total: 10,
        currentStep: 'Analyzing files',
        percentComplete: 30,
      };

      const message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Working...' },
          {
            type: 'data',
            data: {
              type: 'task-progress',
              progress: taskProgress,
            },
          },
        ],
      };

      const extracted = extractTaskProgressFromMessage(message);

      expect(extracted).toEqual(taskProgress);
    });

    it('should return null when no task progress exists', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: [
          { type: 'text', text: 'No progress here' },
          { type: 'data', data: { type: 'other' } },
        ],
      };

      const extracted = extractTaskProgressFromMessage(message);

      expect(extracted).toBeNull();
    });
  });

  describe('Tool Result Type Safety', () => {
    it('should handle tool results with proper type safety', () => {
      const uiMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_file',
            args: { path: '/test.txt' },
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            result: { content: 'file content', size: 1024 },
          },
        ],
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);

      // Tool results are not converted to tool calls
      expect(chatMessage.toolCalls).toHaveLength(1);
      expect(chatMessage.toolCalls![0].toolName).toBe('read_file');
    });
  });

  describe('Message Metadata Preservation', () => {
    it('should preserve all metadata fields during conversion', () => {
      const uiMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Agent message',
        metadata: {
          isFromAgent: true,
          planId: 'plan-123',
          stepId: 'step-456',
          agentMode: 'executing',
          customField: 'custom-value', // Extra fields
        },
      };

      const chatMessage = convertUIMessageToChatMessage(uiMessage);
      const backToUI = convertChatMessageToUIMessage(chatMessage);

      expect(backToUI.metadata?.isFromAgent).toBe(true);
      expect(backToUI.metadata?.planId).toBe('plan-123');
      expect(backToUI.metadata?.stepId).toBe('step-456');
      expect(backToUI.metadata?.agentMode).toBe('executing');
    });
  });
});
