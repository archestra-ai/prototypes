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
 * 2. **Error filtering**: Filters out spurious "text part not found" errors that can
 *    occur during streaming but don't affect the actual message content.
 *
 * 3. **Ensures proper stream termination**: Guarantees that a [DONE] message is sent
 *    at the end of the stream for proper client-side handling.
 *
 * @returns TransformStream that processes SSE chunks from Ollama
 */
export function createOllamaCustomTransformer() {
  // Track whether we've seen the start-step event (indicates message streaming is beginning)
  let hasSeenStartStep = false;

  // Track whether we've already injected the text-start event
  let hasInjectedTextStart = false;

  // Store the message ID to ensure consistency across events
  let messageId: string | null = null;

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
        // SSE data lines start with "data: "
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            // Track when we see start-step to know when message content is about to begin
            if (data.type === 'start-step') {
              hasSeenStartStep = true;
            }

            // Inject text-start event before the first text-delta
            // This is required for Vercel AI SDK to properly initialize the message
            if (data.type === 'text-delta' && hasSeenStartStep && !hasInjectedTextStart) {
              // Use the ID from the text-delta or generate a new one
              messageId = data.id || generateId();

              // Create and send the text-start event
              const textStartEvent = `data: {"type":"text-start","id":"${messageId}"}\n\n`;
              controller.enqueue(new TextEncoder().encode(textStartEvent));
              hasInjectedTextStart = true;
            }

            // Filter out "text part not found" errors
            // These are spurious errors that can occur but don't affect the message
            if (
              data.type === 'error' &&
              data.errorText?.includes('text part') &&
              data.errorText?.includes('not found')
            ) {
              // Skip this line entirely - don't add to filteredChunk
              continue;
            }
          } catch (e) {
            // If we can't parse as JSON, it might be [DONE] or other special messages
            // Keep these lines as-is
          }
        }

        // Add the line to our filtered output (unless it was filtered out above)
        filteredChunk += line + '\n';
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
