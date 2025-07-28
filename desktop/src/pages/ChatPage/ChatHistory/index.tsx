import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { parseThinkingContent } from '@/lib/utils/chat';
import { cn } from '@/lib/utils/tailwind';
import { useChatContext } from '@/providers/chat-provider';
import { ChatInteraction, ToolCall, ToolCallStatus } from '@/types';

import { AssistantInteraction, OtherInteraction, ToolInteraction, UserInteraction } from './Interactions';

const CHAT_SCROLL_AREA_ID = 'chat-scroll-area';
const CHAT_SCROLL_AREA_SELECTOR = `#${CHAT_SCROLL_AREA_ID} [data-radix-scroll-area-viewport]`;

interface ChatHistoryProps {}

interface InteractionProps {
  interaction: ChatInteraction;
}

const Interaction = ({ interaction }: InteractionProps) => {
  switch (interaction.role) {
    case 'user':
      return <UserInteraction interaction={interaction} />;
    case 'assistant':
      return <AssistantInteraction interaction={interaction} />;
    case 'tool':
      return <ToolInteraction interaction={interaction} />;
    default:
      return <OtherInteraction interaction={interaction} />;
  }
};

const getInteractionClassName = (interaction: ChatInteraction) => {
  switch (interaction.role) {
    case 'user':
      return 'bg-primary/10 border border-primary/20 ml-8';
    case 'assistant':
      return 'bg-secondary/50 border border-secondary mr-8';
    // NOTE: we can probably delete this.. this isn't a real role returned by ollama?
    // case ChatInteractionRole.Error:
    //   return 'bg-destructive/10 border border-destructive/20 text-destructive';
    case 'system':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600';
    case 'tool':
      return 'bg-blue-500/10 border border-blue-500/20 text-blue-600';
    default:
      return 'bg-muted border';
  }
};

// Helper function to extract result text from tool output
const extractToolResultText = (part: any): string => {
  // Check if output has content array structure
  if (part.output?.content && Array.isArray(part.output.content)) {
    const textContent = part.output.content.find((c: any) => c.type === 'text');
    return textContent?.text || '';
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

// Helper function to process tool result part
const processToolResultPart = (part: any, toolCallId: string, toolCallsMap: Map<string, ToolCall>): void => {
  const existingCall = toolCallsMap.get(toolCallId);
  if (!existingCall) return;

  const resultText = extractToolResultText(part);
  const isError = part.state === 'output-error';

  toolCallsMap.set(toolCallId, {
    ...existingCall,
    result: resultText,
    error: isError ? part.errorText || 'Unknown error' : null,
    status: isError ? ToolCallStatus.Error : ToolCallStatus.Completed,
    endTime: new Date(),
    executionTime: existingCall.startTime ? new Date().getTime() - existingCall.startTime.getTime() : null,
  });
};

export default function ChatHistory(_props: ChatHistoryProps) {
  const { messages, status } = useChatContext();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStreaming = status === 'streaming';

  // Scroll to bottom when new messages are added or content changes
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current && shouldAutoScroll && !isScrollingRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [shouldAutoScroll]);

  const checkIfAtBottom = useCallback(() => {
    if (!scrollAreaRef.current) {
      return false;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;

    // Consider "at bottom" to be within 10px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    return isAtBottom;
  }, []);

  const handleScroll = useCallback(() => {
    // Mark that user is scrolling
    isScrollingRef.current = true;

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce the scroll end detection
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      const isAtBottom = checkIfAtBottom();
      setShouldAutoScroll(isAtBottom);
    }, 150); // 150ms debounce
  }, [checkIfAtBottom]);

  // Set up scroll area ref and scroll listener
  useEffect(() => {
    const scrollArea = document.querySelector(CHAT_SCROLL_AREA_SELECTOR) as HTMLElement;
    if (scrollArea) {
      scrollAreaRef.current = scrollArea;
      scrollArea.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        scrollArea.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Trigger scroll when messages change (only if shouldAutoScroll is true)
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, scrollToBottom]);

  // Process messages to split tool calls into separate entries
  const processedMessages = useMemo(() => {
    const result: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      thinking?: string;
      toolCalls?: ToolCall[];
      originalMessageId: string;
      isToolOnly?: boolean;
    }> = [];

    messages.forEach((message) => {
      // Safety check for message parts
      if (!message.parts || !Array.isArray(message.parts)) {
        result.push({
          id: message.id,
          role: message.role as any,
          content: '',
          originalMessageId: message.id,
        });
        return;
      }

      if (message.role === 'assistant') {
        // For streaming messages, show content immediately
        const isLastMessage = messages[messages.length - 1]?.id === message.id;
        const isMessageStreaming = isLastMessage && isStreaming;

        // Group parts by text block ID to handle multiple text segments
        const allParts = message.parts || [];
        const textBlockMap = new Map<string, string>();
        const toolParts: any[] = [];
        const textBlockOrder: string[] = [];

        // First pass: collect text blocks and tool parts
        allParts.forEach((part: any) => {
          if (part && part.type === 'text') {
            // For parts without ID (legacy or simple messages), use a default ID
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

          // Process tool calls
          toolParts.forEach((part: any) => {
            try {
              const toolCallId = part?.toolCallId || crypto.randomUUID();

              if (part?.state === 'input-streaming' || part?.state === 'input-available') {
                const toolNameFromType = part?.type?.replace('tool-', '') || '';
                const toolName = part?.callProviderMetadata?.functionName || toolNameFromType || '';
                const [serverName, ...toolNameParts] = toolName.split('_');
                const displayToolName = toolNameParts.join('_') || toolName;

                toolCallsMap.set(toolCallId, {
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
                });
              } else if (part?.state === 'output-available' || part?.state === 'output-error') {
                const existingCall = toolCallsMap.get(toolCallId);

                if (!existingCall && part?.input) {
                  // Complete tool call
                  const toolNameFromType = part?.type?.replace('tool-', '') || '';
                  const toolName = part?.callProviderMetadata?.functionName || toolNameFromType || '';
                  const [serverName, ...toolNameParts] = toolName.split('_');
                  const displayToolName = toolNameParts.join('_') || toolName;

                  toolCallsMap.set(toolCallId, {
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
                  });
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

          result.push({
            id: message.id,
            role: message.role,
            content: response || (thinking && !isMessageStreaming ? '[Thinking complete]' : ''),
            thinking: thinking,
            originalMessageId: message.id,
          });
        }
      } else {
        // Non-assistant messages stay as-is
        const rawContent = message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text || '')
          .join('');

        result.push({
          id: message.id,
          role: message.role,
          content: rawContent,
          originalMessageId: message.id,
        });
      }
    });

    return result;
  }, [messages]);

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full border rounded-lg">
      <div className="p-4 space-y-4">
        {processedMessages.map((message, index) => {
          // Check if this is the last message and we're streaming
          const isLastMessage = index === processedMessages.length - 1;
          const isMessageStreaming = isLastMessage && isStreaming && message.role === 'assistant';

          // Convert processed message to ChatInteraction format
          const interaction: ChatInteraction = {
            id: message.id,
            role: message.role as any, // Cast to any since ChatInteraction expects a different type
            content: message.content || '',
            thinking: message.thinking || '',
            toolCalls: message.toolCalls || [],
            images: [],
            thinkingContent: message.thinking || '',
            isStreaming: isMessageStreaming && !message.thinking && !message.isToolOnly,
            isThinkingStreaming: isMessageStreaming && !!message.thinking,
            isToolExecuting:
              isMessageStreaming && (message.toolCalls?.some((tc) => tc.status === ToolCallStatus.Executing) || false),
            created_at: new Date().toISOString(),
          };

          return (
            <div key={message.id} className={cn('p-3 rounded-lg', getInteractionClassName(interaction))}>
              <div className="text-xs font-medium mb-1 opacity-70 capitalize">{message.role}</div>
              <Interaction interaction={interaction} />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
