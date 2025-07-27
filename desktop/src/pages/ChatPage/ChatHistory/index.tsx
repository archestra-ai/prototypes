import { useCallback, useEffect, useRef, useState } from 'react';

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
  console.log('[ChatHistory] Interaction:', interaction);
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

  // Debug logging
  useEffect(() => {
    console.log('[ChatHistory] Messages:', messages);
    console.log('[ChatHistory] Messages length:', messages.length);
    if (messages.length > 0) {
      console.log('[ChatHistory] First message:', messages[0]);
      console.log('[ChatHistory] Last message parts:', messages[messages.length - 1].parts);
    }
  }, [messages]);

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

  return (
    <ScrollArea id={CHAT_SCROLL_AREA_ID} className="h-full w-full border rounded-lg">
      <div className="p-4 space-y-4">
        {messages.map((message, index) => {
          // Extract text content from message parts
          const rawContent = message.parts.find((part) => part.type === 'text')?.text || '';

          // Parse thinking content if this is an assistant message
          const { thinking, response, isThinkingStreaming } =
            message.role === 'assistant'
              ? parseThinkingContent(rawContent)
              : { thinking: '', response: rawContent, isThinkingStreaming: false };

          // Check if this is the last message and we're streaming
          const isLastMessage = index === messages.length - 1;
          const isMessageStreaming = isLastMessage && isStreaming && message.role === 'assistant';

          // Extract tool calls from message parts
          const toolCalls: ToolCall[] = [];
          const toolCallsMap = new Map<string, ToolCall>();

          message.parts.forEach((part: any) => {
            // Debug log all parts
            console.log('[ChatHistory] Processing part:', {
              type: part.type,
              state: part.state,
              toolCallId: part.toolCallId,
              hasInput: !!part.input,
              hasOutput: !!part.output,
            });

            // Check if this is a tool-related part
            if (part.type && part.type.startsWith('tool-')) {
              const toolCallId = part.toolCallId || crypto.randomUUID();

              if (part.state === 'input-streaming' || part.state === 'input-available') {
                // This is a tool call
                // Extract tool name from the type field (e.g., "tool-Everything_add" -> "Everything_add")
                const toolNameFromType = part.type.replace('tool-', '');
                const toolName = part.callProviderMetadata?.functionName || toolNameFromType || '';
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
              } else if (part.state === 'output-available' || part.state === 'output-error') {
                // This could be either just a result OR a complete tool call with both input and output
                const existingCall = toolCallsMap.get(toolCallId);

                if (!existingCall && part.input) {
                  // This is a complete tool call - create it first
                  const toolNameFromType = part.type.replace('tool-', '');
                  const toolName = part.callProviderMetadata?.functionName || toolNameFromType || '';
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

                // Now process the result
                processToolResultPart(part, toolCallId, toolCallsMap);
              }
            }
          });

          // Convert map to array
          toolCallsMap.forEach((toolCall) => {
            toolCalls.push(toolCall);
          });

          // Debug logging for tool calls
          if (toolCalls.length > 0) {
            console.log('[ChatHistory] Tool calls found:', toolCalls);
          }

          // Check if any tools are currently executing
          const hasExecutingTools = toolCalls.some((tc) => tc.status === ToolCallStatus.Executing);

          // Convert UIMessage to ChatInteraction format
          const interaction: ChatInteraction = {
            id: message.id,
            role: message.role,
            content: response,
            thinking: thinking,
            toolCalls: toolCalls,
            images: [],
            thinkingContent: thinking,
            isStreaming: isMessageStreaming && !isThinkingStreaming && !hasExecutingTools,
            isThinkingStreaming: isMessageStreaming && isThinkingStreaming,
            isToolExecuting: isMessageStreaming && hasExecutingTools,
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
