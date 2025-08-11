import { generateId } from 'ai';

/**
 * Creates a custom transform stream for Ollama responses using Vercel AI SDK.
 *
 * This transformer addresses specific issues with the Ollama + Vercel AI SDK integration:
 *
 * 1. **Missing text-start event**: The Vercel AI SDK expects a text-start event before
 *    text-delta events to properly initialize message streaming. Ollama's response
 *    doesn't include this, so we inject it before the first text-delta.
 *
 * 2. **Missing tool-input-start event**: When tools are called, the SDK expects a
 *    tool-input-start event before tool-input-delta events.
 *
 * 3. **Reasoning support**: Detects and handles reasoning content from models like
 *    deepseek-r1 and qwen3. Converts text-delta events containing <think> or <thinking>
 *    tags into reasoning-start and reasoning-delta events for proper UI display.
 *
 * 4. **Error filtering**: Filters out spurious "text part not found" errors that can
 *    occur during streaming but don't affect the actual message content.
 *
 * 5. **Ensures proper stream termination**: Guarantees that a [DONE] message is sent
 *    at the end of the stream for proper client-side handling.
 *
 * @returns TransformStream that processes SSE chunks from Ollama
 */
export function createOllamaCustomTransformer() {
  // Track whether we've seen the start-step event (indicates message streaming is beginning)
  let hasSeenStartStep = false;

  // Track whether we've already injected the text-start event
  let hasInjectedTextStart = false;

  // Track tool-related state
  let currentToolCallId: string | null = null;
  let hasInjectedToolStart = false;

  // Store the message ID to ensure consistency across events
  let messageId: string | null = null;

  // Track reasoning-related state
  let hasInjectedReasoningStart = false;
  let isInReasoningMode = false;

  return new TransformStream({
    /**
     * Processes each chunk of the SSE stream
     * @param chunk - Raw bytes from the upstream response
     * @param controller - Controller to enqueue transformed chunks
     */
    transform(chunk, controller) {
      const chunkStr = new TextDecoder().decode(chunk);

      // SSE format uses newline-separated messages, so we need to process line by line
      const lines = chunkStr.split('\n');
      let filteredChunk = '';

      for (const line of lines) {
        let processedLine = line;
        let shouldSkipLine = false;

        // SSE data lines start with "data: "
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            // Track when we see start-step to know when message content is about to begin
            if (data.type === 'start-step') {
              hasSeenStartStep = true;
            }

            // Check if this is reasoning content (for models like deepseek-r1 or qwen3)
            // Reasoning content typically starts with <think> or similar markers
            const isReasoningContent =
              data.type === 'text-delta' &&
              data.delta &&
              (data.delta.includes('<think>') || data.delta.includes('<thinking>'));

            // Inject reasoning-start event before reasoning content
            if (isReasoningContent && !hasInjectedReasoningStart) {
              messageId = data.id || generateId();
              const reasoningStartEvent = `data: {"type":"reasoning-start","id":"${messageId}"}\n\n`;
              controller.enqueue(new TextEncoder().encode(reasoningStartEvent));
              hasInjectedReasoningStart = true;
              isInReasoningMode = true;
            }

            // Convert text-delta to reasoning-delta if in reasoning mode
            if (data.type === 'text-delta' && isInReasoningMode) {
              // Check if reasoning is ending
              if (data.delta && (data.delta.includes('</think>') || data.delta.includes('</thinking>'))) {
                isInReasoningMode = false;
                // Remove the closing tag from the delta
                data.delta = data.delta.replace(/<\/think>/g, '').replace(/<\/thinking>/g, '');
                if (!data.delta.trim()) {
                  shouldSkipLine = true;
                }
              }

              if (!shouldSkipLine) {
                // Remove opening tags if present
                if (data.delta) {
                  data.delta = data.delta.replace(/<think>/g, '').replace(/<thinking>/g, '');
                }

                // Convert to reasoning-delta and reconstruct the line
                data.type = 'reasoning-delta';
                processedLine = 'data: ' + JSON.stringify(data);
              }
            }

            // Inject text-start event before the first text-delta (non-reasoning)
            // This is required for Vercel AI SDK to properly initialize the message
            if (data.type === 'text-delta' && hasSeenStartStep && !hasInjectedTextStart && !isInReasoningMode) {
              // Use the ID from the text-delta or generate a new one
              messageId = data.id || generateId();

              // Create and send the text-start event
              const textStartEvent = `data: {"type":"text-start","id":"${messageId}"}\n\n`;
              controller.enqueue(new TextEncoder().encode(textStartEvent));
              hasInjectedTextStart = true;
            }

            // Inject tool-input-start event before the first tool-input-delta
            if (data.type === 'tool-input-delta' && !hasInjectedToolStart) {
              // Extract or generate tool call ID
              currentToolCallId = data.toolCallId || generateId();
              const toolName = data.toolName || 'unknown';

              // Create and send the tool-input-start event
              const toolStartEvent = `data: {"type":"tool-input-start","toolCallId":"${currentToolCallId}","toolName":"${toolName}","dynamic":true}\n\n`;
              controller.enqueue(new TextEncoder().encode(toolStartEvent));
              hasInjectedToolStart = true;
            }

            // Reset tool tracking when we see a new tool call or finish
            if (data.type === 'tool-result' || data.type === 'finish-step') {
              hasInjectedToolStart = false;
              currentToolCallId = null;
            }

            // Filter out "text part not found" and "reasoning part 0 not found" errors
            // These are spurious errors that can occur but don't affect the message
            if (
              data.type === 'error' &&
              // data.errorText?.includes('text part') &&
              data.errorText?.includes('not found')
            ) {
              // Skip this line entirely - don't add to filteredChunk
              shouldSkipLine = true;
            }
          } catch (e) {
            // If we can't parse as JSON, it might be [DONE] or other special messages
            // Keep these lines as-is
          }
        }

        // Add the line to our filtered output (unless it was filtered out above)
        if (!shouldSkipLine) {
          filteredChunk += processedLine + '\n';
        }
      }

      // Only enqueue if we have actual content to send
      if (filteredChunk.trim()) {
        controller.enqueue(new TextEncoder().encode(filteredChunk));
      }
    },

    /**
     * Called when the stream is closing
     * Ensures proper stream termination with [DONE] message
     */
    flush(controller) {
      // The [DONE] message signals to the client that streaming is complete
      // We ensure it's always sent, even if the upstream didn't include it
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    },
  });
}
