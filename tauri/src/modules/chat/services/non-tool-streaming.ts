import { IChatMessage } from "../types";
import { parseThinkingContent } from "../utils/thinking-parser";
import { updateMessage, addCancellationText } from "../utils/message-utils";

interface NonToolStreamingOptions {
  ollamaPort: number;
  model: string;
  messages: Array<{ role: string; content: string }>;
  aiMsgId: string;
  abortSignal: AbortSignal;
  onUpdate: (updater: (prev: IChatMessage[]) => IChatMessage[]) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function handleNonToolStreaming({
  ollamaPort,
  model,
  messages,
  aiMsgId,
  abortSignal,
  onUpdate,
  onComplete,
  onError,
}: NonToolStreamingOptions) {
  try {
    const response = await fetch(
      `http://localhost:${ollamaPort}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortSignal,
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
          options: {
            temperature: 0.7,
            top_p: 0.95,
            top_k: 40,
            num_predict: 32768,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let accumulatedContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.message?.content) {
            accumulatedContent += data.message.content;
            const parsed = parseThinkingContent(accumulatedContent);

            onUpdate((prev) =>
              updateMessage(prev, aiMsgId, {
                content: parsed.response,
                thinkingContent: parsed.thinking,
                isStreaming: !data.done,
                isThinkingStreaming: parsed.isThinkingStreaming && !data.done,
              })
            );
          }

          if (data.done) {
            onComplete();
            return;
          }
        } catch (parseError) {
          console.warn("Failed to parse chunk:", line);
        }
      }
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      onUpdate((prev) =>
        updateMessage(prev, aiMsgId, {
          content: addCancellationText(prev.find(msg => msg.id === aiMsgId)?.content || ""),
          isStreaming: false,
          isThinkingStreaming: false,
        })
      );
    } else {
      onError(error);
    }
  }
}