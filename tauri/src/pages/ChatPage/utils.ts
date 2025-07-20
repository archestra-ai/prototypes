import { IChatMessage } from './types';

export interface ParsedContent {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
}

export function createUserMessage(content: string): IChatMessage {
  return {
    id: Date.now().toString(),
    role: "user",
    content,
    timestamp: new Date(),
  };
}

export function createAssistantMessage(): IChatMessage {
  return {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content: "",
    timestamp: new Date(),
    isStreaming: true,
  };
}

export function createSystemMessage(content: string): IChatMessage {
  return {
    id: (Date.now() + Math.random()).toString(),
    role: "system",
    content,
    timestamp: new Date(),
  };
}

export function updateMessage(
  messages: IChatMessage[],
  messageId: string,
  updates: Partial<IChatMessage>
): IChatMessage[] {
  return messages.map((msg) =>
    msg.id === messageId ? { ...msg, ...updates } : msg
  );
}

export function checkModelSupportsTools(model: string): boolean {
  return !!(
    model &&
    (model.includes("functionary") ||
      model.includes("mistral") ||
      model.includes("command") ||
      model.includes("qwen") ||
      model.includes("hermes") ||
      model.includes("llama3") ||
      model.includes("llama-3") ||
      model.includes("phi") ||
      model.includes("granite"))
  );
}

export function isSimpleGreeting(message: string): boolean {
  return /^(hi|hello|hey|greetings?|good\s+(morning|afternoon|evening)|how\s+are\s+you)[\s!?]*$/i.test(
    message.trim()
  );
}

export function addCancellationText(content: string): string {
  return content.includes("[Cancelled]") ? content : content + " [Cancelled]";
}

export function markMessageAsCancelled(message: IChatMessage): IChatMessage {
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
    return { thinking: "", response: "", isThinkingStreaming: false };
  }

  // Handle multiple think blocks and ensure proper parsing
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;

  let thinking = "";
  let response = content;
  let isThinkingStreaming = false;

  // Extract completed thinking blocks first
  const completedMatches = [...content.matchAll(thinkRegex)];
  const completedThinking = completedMatches
    .map((match) => match[1])
    .join("\n\n");

  // Remove completed thinking blocks from content
  let contentWithoutCompleted = content.replace(thinkRegex, "");

  // Check for incomplete thinking block (still streaming)
  const incompleteMatch = contentWithoutCompleted.match(/<think>([\s\S]*)$/);

  if (incompleteMatch) {
    // There's an incomplete thinking block
    const incompleteThinking = incompleteMatch[1];
    const beforeIncomplete = contentWithoutCompleted.substring(
      0,
      contentWithoutCompleted.indexOf("<think>"),
    );

    // Combine completed and incomplete thinking
    thinking = completedThinking
      ? `${completedThinking}\n\n${incompleteThinking}`
      : incompleteThinking;
    response = beforeIncomplete.trim();
    isThinkingStreaming = true;
  } else {
    // No incomplete thinking block
    thinking = completedThinking;
    response = contentWithoutCompleted.trim();
    isThinkingStreaming = false;
  }

  // Debug logging for complex cases
  if (thinking && process.env.NODE_ENV === "development") {
    console.log("🧠 Thinking parsed:", {
      hasCompleted: completedMatches.length > 0,
      hasIncomplete: !!incompleteMatch,
      thinkingLength: thinking.length,
      responseLength: response.length,
      isStreaming: isThinkingStreaming,
    });
  }

  return {
    thinking,
    response,
    isThinkingStreaming,
  };
}
