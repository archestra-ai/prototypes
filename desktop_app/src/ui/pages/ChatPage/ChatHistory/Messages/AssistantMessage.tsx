import { type DynamicToolUIPart, type TextUIPart, UIMessage } from 'ai';

import ThinkBlock from '@ui/components/ThinkBlock';
import ToolInvocation from '@ui/components/ToolInvocation';
import { AIResponse } from '@ui/components/kibo/ai-response';
import { ToolCallStatus } from '@ui/types';

interface AssistantMessageProps {
  message: UIMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
  if (!message.parts) {
    return null;
  }

  let accumulatedText = '';
  const completeThinkBlocks: string[] = [];
  let incompleteThinkBlock: string | null = null;
  let remainingText = '';

  // Process all text parts to extract think blocks
  const allText = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as TextUIPart).text)
    .join('');

  // Parse think blocks from the accumulated text
  let currentPos = 0;
  let textBeforeThink = '';

  while (currentPos < allText.length) {
    const thinkStartIndex = allText.indexOf('<think>', currentPos);

    if (thinkStartIndex === -1) {
      // No more think blocks
      remainingText += allText.substring(currentPos);
      break;
    }

    // Add text before think block
    textBeforeThink += allText.substring(currentPos, thinkStartIndex);

    // Look for the end of think block
    const thinkEndIndex = allText.indexOf('</think>', thinkStartIndex);

    if (thinkEndIndex === -1) {
      // Incomplete think block (still streaming)
      incompleteThinkBlock = allText.substring(thinkStartIndex + 7); // Skip '<think>'
      remainingText = textBeforeThink;
      break;
    } else {
      // Complete think block
      const thinkContent = allText.substring(thinkStartIndex + 7, thinkEndIndex);
      completeThinkBlocks.push(thinkContent);
      currentPos = thinkEndIndex + 8; // Skip '</think>'
    }
  }

  // If no incomplete think block and we processed everything
  if (!incompleteThinkBlock && currentPos < allText.length) {
    remainingText = textBeforeThink + allText.substring(currentPos);
  } else if (!incompleteThinkBlock) {
    remainingText = textBeforeThink;
  }

  // Process other parts (tools)
  const toolParts = message.parts.filter((part) => part.type === 'dynamic-tool');

  return (
    <div className="relative space-y-2">
      {/* Render complete think blocks */}
      {completeThinkBlocks.map((thinkContent, index) => (
        <ThinkBlock key={`think-complete-${index}`} content={thinkContent} isStreaming={false} />
      ))}

      {/* Render incomplete think block if streaming */}
      {incompleteThinkBlock && <ThinkBlock key="think-streaming" content={incompleteThinkBlock} isStreaming={true} />}

      {/* Render remaining text */}
      {remainingText.trim() && <AIResponse key="text-content">{remainingText.trim()}</AIResponse>}

      {/* Render tool invocations */}
      {toolParts.map((part, index) => {
        const tool = part as DynamicToolUIPart;
        return (
          <ToolInvocation
            key={tool.toolCallId || `tool-${index}`}
            toolName={tool.toolName}
            args={'input' in tool ? tool.input : {}}
            result={'output' in tool ? tool.output : undefined}
            state={
              tool.state === 'output-available'
                ? ToolCallStatus.Completed
                : tool.state === 'output-error'
                  ? ToolCallStatus.Error
                  : tool.state === 'input-streaming'
                    ? ToolCallStatus.Pending
                    : ToolCallStatus.Pending
            }
          />
        );
      })}
    </div>
  );
}
