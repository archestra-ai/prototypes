import {
  type ChatWithMessages,
  type ParsedContent,
  type ServerChatWithMessagesRepresentation,
  type ServerToolCallRepresentation,
  type ToolCall,
  ToolCallStatus,
} from '@ui/types';

import { convertArchestraToolNameToServerAndToolName } from './tools';

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

const generateNewToolCallId = () => crypto.randomUUID();

export const initializeToolCalls = (toolCalls: ServerToolCallRepresentation[]): ToolCall[] => {
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
      startTime: null,
      endTime: null,
    };
  });
};

export const initializeChat = (chat: ServerChatWithMessagesRepresentation): ChatWithMessages => {
  return {
    ...chat,
    messages: chat.messages.map((message) => {
      // Content is already a UIMessage from the backend
      // Extract thinking content if it exists in the parts
      let thinkingContent = '';
      let responseContent = '';
      
      // If content is a UIMessage, extract text from parts
      if (message.content && typeof message.content === 'object' && 'parts' in message.content) {
        const uiMessage = message.content as any; // UIMessage
        if (uiMessage.parts) {
          for (const part of uiMessage.parts) {
            if (part.type === 'text') {
              responseContent += part.text;
            } else if (part.type === 'reasoning') {
              thinkingContent += part.text;
            }
          }
        }
      }

      return {
        ...message,
        content: message.content as any, // Already UIMessage
        toolCalls: [] as ToolCall[],
        thinkingContent,
        isStreaming: false,
        isToolExecuting: false,
        isThinkingStreaming: false,
      };
    }),
  };
};
