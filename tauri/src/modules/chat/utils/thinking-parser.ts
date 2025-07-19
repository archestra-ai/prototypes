export interface ParsedContent {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
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