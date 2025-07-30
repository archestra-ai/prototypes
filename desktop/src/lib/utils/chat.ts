import type { ChatWithMessages as ServerChatWithMessages } from '@/lib/api-client';
import { type ChatMessage, type ChatWithMessages, type ToolCall, ToolCallStatus } from '@/types';

import { convertArchestraToolNameToServerAndToolName } from './tools';

interface ParsedContent {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
}

export function checkModelSupportsTools(model: string): boolean {
  return (
    model.includes('functionary') ||
    model.includes('mistral') ||
    model.includes('command') ||
    (model.includes('qwen') && !model.includes('0.6b')) ||
    model.includes('hermes') ||
    model.includes('llama3.1') ||
    model.includes('llama-3.1') ||
    model.includes('phi') ||
    model.includes('granite')
  );
}

export function addCancellationText(content: string): string {
  return content.includes('[Cancelled]') ? content : content + ' [Cancelled]';
}

export function markChatMessageAsCancelled(message: ChatMessage): ChatMessage {
  return {
    ...message,
    isStreaming: false,
    isToolExecuting: false,
    isThinkingStreaming: false,
    content: addCancellationText(message.content),
  };
}

export function parseThinkingContent(content: string): ParsedContent {
  if (!content) {
    return { thinking: '', response: '', isThinkingStreaming: false };
  }

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;

  let thinking = '';
  let response = content;
  let isThinkingStreaming = false;

  const completedMatches = [...content.matchAll(thinkRegex)];
  const completedThinking = completedMatches.map((match) => match[1]).join('\n\n');

  let contentWithoutCompleted = content.replace(thinkRegex, '');

  const incompleteMatch = contentWithoutCompleted.match(/<think>([\s\S]*)$/);

  if (incompleteMatch) {
    const incompleteThinking = incompleteMatch[1];
    const beforeIncomplete = contentWithoutCompleted.substring(0, contentWithoutCompleted.indexOf('<think>'));

    thinking = completedThinking ? `${completedThinking}\n\n${incompleteThinking}` : incompleteThinking;
    response = beforeIncomplete.trim();
    isThinkingStreaming = true;
  } else {
    thinking = completedThinking;
    response = contentWithoutCompleted.trim();
    isThinkingStreaming = false;
  }

  return {
    thinking,
    response,
    isThinkingStreaming,
  };
}

export const generateNewToolCallId = () => crypto.randomUUID();

export const initializeToolCalls = (toolCalls: any[]): ToolCall[] => {
  return toolCalls.map((toolCall) => {
    const [serverName, toolName] = convertArchestraToolNameToServerAndToolName(toolCall.function.name);
    return {
      ...toolCall,
      id: generateNewToolCallId(),
      serverName,
      name: toolName,
      arguments: toolCall.function.arguments as Record<string, any>,
      result: '',
      error: '',
      status: ToolCallStatus.Pending,
      executionTime: 0,
      startTime: undefined,
      endTime: null,
    };
  });
};

export const generateNewMessageId = () => crypto.randomUUID();

export const generateNewMessageCreatedAt = () => crypto.randomUUID();

export const initializeChat = (chat: ServerChatWithMessages): ChatWithMessages => {
  return {
    id: chat.id,
    session_id: chat.session_id,
    title: chat.title ?? null,
    llm_provider: chat.llm_provider,
    created_at: chat.created_at,
    messages: chat.messages.map((message: any) => {
      let content: string;
      let role: string;

      // Handle different message content formats
      if (typeof message.content === 'string') {
        content = message.content;
        role = message.role || 'user';
      } else if (message.content && typeof message.content === 'object') {
        // Extract content from JSON object
        content = message.content.content || '';
        role = message.content.role || message.role || 'user';
      } else {
        content = '';
        role = message.role || 'user';
      }

      const { thinking, response } = parseThinkingContent(content);

      return {
        ...message,
        id: generateNewMessageId(),
        role,
        toolCalls: initializeToolCalls((message.content as any)?.tool_calls || []),
        content: response,
        thinkingContent: thinking,
        isStreaming: false,
        isToolExecuting: false,
        isThinkingStreaming: false,
      };
    }),
  };
};
