import { IChatMessage } from '../types';

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