import { invoke } from "@tauri-apps/api/core";
import { IChatMessage } from "../types";
import { updateMessage } from "../utils/message-utils";

interface ToolStreamingOptions {
  ollamaPort: number;
  model: string;
  message: string;
  aiMsgId: string;
  onUpdate: (updater: (prev: IChatMessage[]) => IChatMessage[]) => void;
}

export async function handleToolStreaming({
  ollamaPort,
  model,
  message,
  aiMsgId,
  onUpdate,
}: ToolStreamingOptions) {
  // Mark AI message as tool executing
  onUpdate((prev) =>
    updateMessage(prev, aiMsgId, {
      isToolExecuting: true,
      content: "",
    })
  );

  // Use the streaming tool-enabled chat
  const messages = [
    { role: "user", content: message, tool_calls: null },
  ];

  await invoke("ollama_chat_with_tools_streaming", {
    port: ollamaPort,
    model: model,
    messages: messages,
  });

  // The response will be handled by the event listeners
}