export interface ParsedContent {
  thinking: string;
  response: string;
  isThinkingStreaming: boolean;
}

export function parseThinkingContent(content: string): ParsedContent {
  // Handle multiple think blocks and ensure proper parsing
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const incompleteThinkMatch = content.match(/<think>([\s\S]*)$/);
  
  let thinking = "";
  let response = content;
  let isThinkingStreaming = false;

  // Extract completed thinking blocks
  const matches = [...content.matchAll(thinkRegex)];
  if (matches.length > 0) {
    // Extract all thinking content
    thinking = matches.map((match) => match[1]).join("\n\n");
    // Remove all thinking blocks from response
    response = content.replace(thinkRegex, "").trim();
  }
  
  // Check for incomplete thinking block (still streaming)
  if (incompleteThinkMatch && !content.includes("</think>")) {
    const incompleteStart = content.indexOf("<think>");
    if (incompleteStart !== -1) {
      thinking = content.substring(incompleteStart + 7);
      response = content.substring(0, incompleteStart).trim();
      isThinkingStreaming = true;
    }
  }

  return {
    thinking,
    response,
    isThinkingStreaming,
  };
}