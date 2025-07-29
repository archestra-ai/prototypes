import { parseThinkingContent } from '@/lib/utils/chat';
import { ToolCall, ToolCallStatus, ToolContent, ToolContentImage, ToolContentText } from '@/types';

// Extend window for debug logging
declare global {
  interface Window {
    _processedMessageIds?: Set<string>;
  }
}

export interface ProcessedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  originalMessageId: string;
  isToolOnly?: boolean;
}

// Helper function to extract result text from tool output
export const extractToolResultText = (part: any): string => {
  // Check if output has content array structure
  if (part.output?.content && Array.isArray(part.output.content)) {
    // Collect all text content
    const textParts = part.output.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
    return textParts.join('\n') || '';
  }

  // Check if output is a string
  if (typeof part.output === 'string') {
    return part.output;
  }

  // Check if output exists as object
  if (part.output) {
    return JSON.stringify(part.output, null, 2);
  }

  // Use error text if available
  if (part.errorText) {
    return part.errorText;
  }

  return '';
};

// Helper function to extract structured content from tool output
export const extractStructuredContent = (part: any): ToolContent[] | undefined => {
  if (part.output?.content && Array.isArray(part.output.content)) {
    return part.output.content
      .map((item: any) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text,
            annotations: item.annotations,
          } as ToolContentText;
        } else if (item.type === 'image') {
          return {
            type: 'image',
            data: item.data,
            mimeType: item.mimeType,
            annotations: item.annotations,
          } as ToolContentImage;
        }
        return null;
      })
      .filter(Boolean) as ToolContent[];
  }
  return undefined;
};

// Helper function to process tool result part
export const processToolResultPart = (part: any, toolCallId: string, toolCallsMap: Map<string, ToolCall>): void => {
  const existingCall = toolCallsMap.get(toolCallId);
  if (!existingCall) {
    return;
  }

  const resultText = extractToolResultText(part);
  const structuredContent = extractStructuredContent(part);
  const isError = part.state === 'output-error';

  toolCallsMap.set(toolCallId, {
    ...existingCall,
    result: resultText,
    structuredOutput: structuredContent ? { content: structuredContent } : undefined,
    error: isError ? part.errorText || 'Unknown error' : null,
    status: isError ? ToolCallStatus.Error : ToolCallStatus.Completed,
    endTime: new Date(),
    executionTime: existingCall.startTime ? new Date().getTime() - existingCall.startTime.getTime() : null,
  });
};

// Create a tool call from a tool part
export const createToolCall = (part: any, toolCallId: string): ToolCall => {
  // Extract tool name from type field (e.g., "tool-Everything_annotatedMessage" -> "Everything_annotatedMessage")
  const toolNameFromType = part?.type?.replace('tool-', '') || '';
  const toolName = part?.callProviderMetadata?.functionName || toolNameFromType || '';
  const [serverName, ...toolNameParts] = toolName.split('_');
  const displayToolName = toolNameParts.join('_') || toolName;

  return {
    id: toolCallId,
    serverName: serverName || '',
    name: displayToolName,
    function: {
      name: toolName,
      arguments: part.input || {},
    },
    arguments: part.input || {},
    result: '',
    error: null,
    status: ToolCallStatus.Executing,
    executionTime: null,
    startTime: new Date(),
    endTime: null,
  };
};

// Process assistant message parts
export const processAssistantMessage = (
  message: any, // Using any since this is from Vercel AI SDK
  isStreaming: boolean
): ProcessedMessage[] => {
  const result: ProcessedMessage[] = [];
  const allParts = message.parts || [];

  // Group parts by text block ID to handle multiple text segments
  const textBlockMap = new Map<string, string>();
  const toolParts: any[] = [];
  const textBlockOrder: string[] = [];

  // First pass: collect text blocks and tool parts
  allParts.forEach((part: any) => {
    if (part && part.type === 'text') {
      const partId = part.id || 'default';
      const existingText = textBlockMap.get(partId) || '';
      textBlockMap.set(partId, existingText + (part.text || ''));
      if (!textBlockOrder.includes(partId)) {
        textBlockOrder.push(partId);
      }
    } else if (part && part.type && part.type.startsWith('tool-')) {
      toolParts.push(part);
    }
  });

  // If we have multiple text blocks or tools, process them separately
  if (textBlockOrder.length > 1 || (textBlockOrder.length > 0 && toolParts.length > 0)) {
    let segmentIndex = 0;
    const toolCallsMap = new Map<string, ToolCall>();

    // Add first text block if it exists
    if (textBlockOrder.length > 0) {
      const firstBlockId = textBlockOrder[0];
      const firstBlockContent = textBlockMap.get(firstBlockId) || '';
      const { thinking, response } = parseThinkingContent(firstBlockContent);

      if (thinking || response) {
        result.push({
          id: `${message.id}-segment-${segmentIndex++}`,
          role: 'assistant',
          content: response || (thinking ? '[Thinking...]' : ''),
          thinking: thinking,
          originalMessageId: message.id,
        });
      }
    }

    // Process tool calls from parts
    toolParts.forEach((part: any) => {
      try {
        const toolCallId = part?.toolCallId || crypto.randomUUID();

        if (part?.state === 'input-streaming' || part?.state === 'input-available') {
          toolCallsMap.set(toolCallId, createToolCall(part, toolCallId));
        } else if (part?.state === 'output-available' || part?.state === 'output-error') {
          const existingCall = toolCallsMap.get(toolCallId);

          if (!existingCall) {
            toolCallsMap.set(toolCallId, createToolCall(part, toolCallId));
          }

          processToolResultPart(part, toolCallId, toolCallsMap);
        }
      } catch (error) {
        console.error('Error processing tool part:', error, part);
      }
    });

    // Add tool calls as separate entries
    toolCallsMap.forEach((toolCall) => {
      result.push({
        id: `${message.id}-tool-${toolCall.id}`,
        role: 'tool',
        content: toolCall.result || toolCall.error || '',
        toolCalls: [toolCall],
        originalMessageId: message.id,
        isToolOnly: true,
      });
    });

    // Add remaining text blocks (after tools)
    for (let i = 1; i < textBlockOrder.length; i++) {
      const blockId = textBlockOrder[i];
      const blockContent = textBlockMap.get(blockId) || '';
      const { thinking, response } = parseThinkingContent(blockContent);

      if (thinking || response) {
        result.push({
          id: `${message.id}-segment-${segmentIndex++}`,
          role: 'assistant',
          content: response || (thinking ? '[Thinking...]' : ''),
          thinking: thinking,
          originalMessageId: message.id,
        });
      }
    }
  } else {
    // Single text block with no tools - process normally (handles streaming)
    const allTextContent = Array.from(textBlockMap.values()).join('');
    const { thinking, response } = parseThinkingContent(allTextContent);
    const isLastMessage = message.isStreaming;
    const isMessageStreaming = isLastMessage && isStreaming;

    result.push({
      id: message.id,
      role: message.role,
      content: response || (thinking && !isMessageStreaming ? '[Thinking complete]' : ''),
      thinking: thinking,
      originalMessageId: message.id,
    });
  }

  return result;
};

// Process all messages
export const processMessages = (messages: any[], isStreaming: boolean): ProcessedMessage[] => {
  const result: ProcessedMessage[] = [];

  messages.forEach((message) => {
    // Safety check for message parts
    if (!message.parts || !Array.isArray(message.parts)) {
      result.push({
        id: message.id,
        role: message.role as any,
        content: message.content || '',
        originalMessageId: message.id,
      });
      return;
    }

    if (message.role === 'assistant') {
      result.push(...processAssistantMessage(message, isStreaming));
    } else {
      // Non-assistant messages stay as-is
      const rawContent = message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join('');

      result.push({
        id: message.id,
        role: message.role as 'user' | 'assistant' | 'system' | 'tool',
        content: rawContent || message.content || '',
        originalMessageId: message.id,
      });
    }
  });

  return result;
};
