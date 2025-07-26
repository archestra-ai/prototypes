import type { ChatWithInteractions as ServerChatWithInteractions } from '@/lib/api-client';
import type { ChatInteraction, ChatWithInteractions } from '@/types';

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

export function markChatInteractionAsCancelled(message: ChatInteraction): ChatInteraction {
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

export const initializeChat = (chat: ServerChatWithInteractions): ChatWithInteractions => {
  return {
    ...chat,
    interactions: chat.interactions.map((interaction) => ({
      ...interaction,
      /**
       * NOTE: for right now, the content is coming from the server as a jsonified string.. we'll worry about
       * better typing here later
       */
      content: JSON.parse(interaction.content as string),
      isStreaming: false,
      isToolExecuting: false,
      isThinkingStreaming: false,
    })),
  };
};
